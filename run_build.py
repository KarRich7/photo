import os
import sys
import glob
import shutil
import subprocess
import plistlib
import re

def run(cmd, cwd=None, env=None):
    print(f"\n▶ [STEP] {cmd}")
    res = subprocess.run(cmd, shell=True, cwd=cwd, env=env)
    if res.returncode != 0:
        print(f"\n❌ Ошибка при выполнении: {cmd}")
        sys.exit(res.returncode)

print("🚀 Старт сборки iOS IPA для PhotoDrop...")

# 1. Выбор и настройка Xcode (с приоритетом для DEVELOPER_DIR из GitHub Action)
current_dev_dir = os.environ.get("DEVELOPER_DIR")
if current_dev_dir and os.path.exists(current_dev_dir):
    selected_developer_dir = current_dev_dir
    print(f"🍏 Используется предустановленный DEVELOPER_DIR: {selected_developer_dir}")
else:
    xcode_candidates = [
        "/Applications/Xcode_16.0.app/Contents/Developer",
        "/Applications/Xcode_16.1.app/Contents/Developer",
        "/Applications/Xcode_15.4.app/Contents/Developer",
        "/Applications/Xcode_16.2.app/Contents/Developer",
        "/Applications/Xcode.app/Contents/Developer"
    ]
    selected_developer_dir = None
    for candidate in xcode_candidates:
        if os.path.exists(candidate):
            selected_developer_dir = candidate
            break

if selected_developer_dir:
    print(f"🍏 Выбран Developer Dir: {selected_developer_dir}")
    os.environ["DEVELOPER_DIR"] = selected_developer_dir
    try:
        subprocess.run(f"sudo xcode-select -s '{selected_developer_dir}'", shell=True)
    except Exception as e:
        print(f"⚠️ Предупреждение xcode-select: {e}")

# Проверяем версию Xcode и наличие SDK
run("xcodebuild -version")
try:
    sdk_res = subprocess.run("xcrun --sdk iphoneos --show-sdk-path", shell=True, capture_output=True, text=True)
    if sdk_res.returncode == 0:
        print(f"📱 Найден iOS SDK: {sdk_res.stdout.strip()}")
    else:
        print(f"⚠️ Предупреждение поиска SDK: {sdk_res.stderr.strip()}")
except Exception as e:
    print(f"⚠️ Ошибка вызова xcrun: {e}")

# Диагностика доступных симуляторов
print("\n🔍 Проверка зарегистрированных платформ CoreSimulator:")
subprocess.run("xcrun simctl list runtimes", shell=True)

# 2. Очистка старых артефактов и кэшей
print("\n🧹 Очистка старых файлов сборки...")
for path in ["package-lock.json", "node_modules", "ios", "Payload", "PhotoDrop.ipa", "xcode_full.log"]:
    if os.path.isdir(path):
        shutil.rmtree(path)
    elif os.path.isfile(path):
        os.remove(path)

# 3. Чистая установка зависимостей
run("npm install --legacy-peer-deps")

# 4. Генерация нативного проекта iOS через Expo Prebuild
run("npx expo prebuild --platform ios --clean")

# 5. Исключение Storyboard из проекта для предотвращения ошибок ibtool (iOS Platform Not Installed)
print("\n🩹 Проверка Storyboard и настройка нативного UILaunchScreen...")

# 5.1. Удаляем физические файлы storyboard
for root, _, files in os.walk("ios"):
    for file in files:
        if file.endswith(".storyboard"):
            sb_path = os.path.join(root, file)
            os.remove(sb_path)
            print(f"🗑 Удален файл storyboard: {sb_path}")

# 5.2. Полностью вырезаем SplashScreen из project.pbxproj, чтобы Xcode не искал его и не вызывал ibtool
def clean_pbxproj_storyboard(content):
    # Находим ID вариантов из PBXVariantGroup
    variant_children = set()
    for m in re.finditer(r'([0-9A-Fa-f]{24})\s*/\*\s*SplashScreen\.storyboard\s*\*/\s*=\s*\{[^}]*isa\s*=\s*PBXVariantGroup;[^}]*children\s*=\s*\(([^)]*)\);', content):
        for cid in re.findall(r'([0-9A-Fa-f]{24})', m.group(2)):
            variant_children.add(cid)

    lines = content.splitlines(True)
    new_lines = []
    skip_block = False
    brace_depth = 0

    for line in lines:
        if not skip_block:
            # Пропускаем блоки SplashScreen и его дочерних вариантов
            if ("SplashScreen.storyboard" in line or any(cid in line for cid in variant_children)) and ("=" in line and "{" in line):
                skip_block = True
                brace_depth = line.count("{") - line.count("}")
                if brace_depth <= 0:
                    skip_block = False
                continue

            # Пропускаем ссылки внутри массивов files и children
            if "SplashScreen.storyboard" in line or any(cid in line for cid in variant_children):
                continue

            new_lines.append(line)
        else:
            brace_depth += line.count("{") - line.count("}")
            if brace_depth <= 0:
                skip_block = False
            continue

    result = "".join(new_lines)
    result = re.sub(r'UILaunchStoryboardName\s*=\s*[^;]+;', 'UILaunchStoryboardName = "";', result)
    return result

for root, _, files in os.walk("ios"):
    if "project.pbxproj" in files:
        pbx_path = os.path.join(root, "project.pbxproj")
        with open(pbx_path, "r", encoding="utf-8") as f:
            pbx_data = f.read()
        
        cleaned_pbx = clean_pbxproj_storyboard(pbx_data)
        with open(pbx_path, "w", encoding="utf-8") as f:
            f.write(cleaned_pbx)
        print(f"✅ SplashScreen полностью удален из {pbx_path} (Xcode не будет запускать ibtool)")

# 5.3. Безопасная настройка Info.plist через plistlib (нативный UILaunchScreen)
for root, _, files in os.walk("ios"):
    if "Info.plist" in files:
        plist_path = os.path.join(root, "Info.plist")
        try:
            with open(plist_path, "rb") as fp:
                pl = plistlib.load(fp)
            
            pl["UILaunchScreen"] = {}
            if "UILaunchStoryboardName" in pl:
                del pl["UILaunchStoryboardName"]
            
            with open(plist_path, "wb") as fp:
                plistlib.dump(pl, fp)
            print(f"✅ Настроен нативный launch screen в: {plist_path}")
        except Exception as e:
            print(f"⚠️ Не удалось обновить {plist_path}: {e}")

# 6. Корректная настройка ios/Podfile (отключение песочницы для скриптов в Xcode 16)
podfile_path = "ios/Podfile"
if os.path.exists(podfile_path):
    with open(podfile_path, "r", encoding="utf-8") as f:
        pod_content = f.read()

    sandbox_patch = """
    # Отключение песочницы скриптов сборки для совместимости с Xcode 16
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
      end
    end
"""
    if "ENABLE_USER_SCRIPT_SANDBOXING" not in pod_content:
        if "react_native_post_install(" in pod_content:
            target_hook = "react_native_post_install("
            idx = pod_content.find(target_hook)
            end_idx = pod_content.find(")", idx)
            if end_idx != -1:
                pod_content = pod_content[:end_idx + 1] + sandbox_patch + pod_content[end_idx + 1:]
                print("✅ Подключено ENABLE_USER_SCRIPT_SANDBOXING=NO внутрь post_install в Podfile")
        elif "post_install do |installer|" in pod_content:
            pod_content = pod_content.replace(
                "post_install do |installer|",
                "post_install do |installer|" + sandbox_patch
            )
            print("✅ Подключено ENABLE_USER_SCRIPT_SANDBOXING=NO в начало post_install")

    with open(podfile_path, "w", encoding="utf-8") as f:
        f.write(pod_content)

# 7. Установка CocoaPods зависимостей
run("pod install --repo-update", cwd="ios")

# 8. Настройка локального окружения Node для фаз сборки Xcode
node_bin = shutil.which("node")
if node_bin:
    node_dir = os.path.dirname(node_bin)
    with open("ios/.xcode.env.local", "w", encoding="utf-8") as f:
        f.write(f"export NODE_BINARY={node_bin}\n")
        f.write(f"export PATH={node_dir}:$PATH\n")
    print(f"✅ Создан ios/.xcode.env.local с NODE_BINARY={node_bin}")

# 9. Определение схемы и workspace
workspaces = glob.glob("ios/*.xcworkspace")
if not workspaces:
    print("❌ .xcworkspace не найден в папке ios!")
    sys.exit(1)

ws_name = os.path.basename(workspaces[0])
scheme = ws_name.replace(".xcworkspace", "")
print(f"📦 Workspace: {ws_name}, Схема: {scheme}")

# 10. Сборка через xcodebuild без требования подписи (для Sideloadly / AltStore)
build_cmd = (
    f'xcodebuild -workspace "ios/{ws_name}" '
    f'-scheme "{scheme}" '
    f'-configuration Release '
    f'-sdk iphoneos '
    f'-destination "generic/platform=iOS" '
    f'CODE_SIGNING_ALLOWED=NO '
    f'CODE_SIGNING_REQUIRED=NO '
    f'CODE_SIGN_IDENTITY="" '
    f'ENABLE_USER_SCRIPT_SANDBOXING=NO '
    f'ASSETCATALOG_COMPILER_GENERATE_ASSET_SYMBOLS=NO '
    f'ONLY_ACTIVE_ARCH=YES '
    f'-derivedDataPath ios/build '
    f'build'
)

print("\n▶ Идет компиляция проекта...")

with open("xcode_full.log", "w", encoding="utf-8") as full_log:
    process = subprocess.run(build_cmd, shell=True, stdout=full_log, stderr=subprocess.STDOUT)

if process.returncode != 0:
    print(f"\n❌ Сборка завершилась с ошибкой (код {process.returncode}).")
    print("🔍 Извлекаем ключевые строки ошибок:\n" + "=" * 50)
    
    if os.path.exists("xcode_full.log"):
        with open("xcode_full.log", "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()

        error_lines = []
        for idx, line in enumerate(lines):
            low = line.lower()
            if "error:" in low or "fatal error" in low or "failed to" in low or "** build failed **" in low:
                start = max(0, idx - 1)
                end = min(len(lines), idx + 2)
                for i in range(start, end):
                    if lines[i] not in error_lines:
                        error_lines.append(lines[i])

        if error_lines:
            print("".join(error_lines[-35:]))
        else:
            print("".join(lines[-35:]))
    print("=" * 50)
    sys.exit(process.returncode)

# 11. Упаковка .app в PhotoDrop.ipa
print("\n📦 Упаковка приложения в PhotoDrop.ipa...")
os.makedirs("Payload", exist_ok=True)
app_files = glob.glob("ios/build/Build/Products/Release-iphoneos/*.app")
if not app_files:
    app_files = glob.glob(os.path.expanduser("~/Library/Developer/Xcode/DerivedData/*/Build/Products/Release-iphoneos/*.app"))

if app_files:
    app_path = app_files[0]
    print(f"📱 Найден бандл приложения: {app_path}")
    dest = os.path.join("Payload", os.path.basename(app_path))
    if os.path.exists(dest):
        shutil.rmtree(dest)
    shutil.copytree(app_path, dest)
    run("zip -r -q PhotoDrop.ipa Payload")
    
    ipa_size = os.path.getsize("PhotoDrop.ipa") / (1024 * 1024)
    print(f"🎉 PhotoDrop.ipa успешно собран! Размер: {ipa_size:.2f} MB")
    print("📲 Файл готов для установки через Sideloadly / AltStore / TrollStore.")
else:
    print("❌ Не найден скомпилированный .app файл в Products")
    sys.exit(1)