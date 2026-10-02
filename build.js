const { execSync } = require('child_process');
const fs = require('fs');

console.log('🚀 Запуск сборки IPA...');

// Путь к Node для сборщика Xcode
const nodePath = String(execSync('which node')).trim();
if (!fs.existsSync('ios')) fs.mkdirSync('ios');
fs.writeFileSync('ios/.xcode.env.local', 'export NODE_BINARY=' + nodePath + '\n');

// Отключаем песочницу в Pods
const podProj = 'ios/Pods/Pods.xcodeproj/project.pbxproj';
if (fs.existsSync(podProj)) {
  let content = fs.readFileSync(podProj, 'utf8');
  content = content.replace(/ENABLE_USER_SCRIPT_SANDBOXING = YES/g, 'ENABLE_USER_SCRIPT_SANDBOXING = NO');
  fs.writeFileSync(podProj, content);
  console.log('✅ Настройки Pods.xcodeproj обновлены');
}

const iosFiles = fs.readdirSync('ios');
const ws = iosFiles.find(f => f.endsWith('.xcworkspace'));
const scheme = ws.replace('.xcworkspace', '');

console.log('📦 Workspace:', ws);
console.log('📦 Схема:', scheme);

const buildCmd = 'xcodebuild -workspace "ios/' + ws + '" -scheme "' + scheme + '" -configuration Release -sdk iphoneos -destination "generic/platform=iOS" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" ENABLE_USER_SCRIPT_SANDBOXING=NO ONLY_ACTIVE_ARCH=YES -derivedDataPath ios/build';

try {
  execSync(buildCmd, { stdio: 'inherit' });
  
  console.log('📦 Упаковка в .ipa...');
  execSync('mkdir -p Payload', { stdio: 'inherit' });
  execSync('cp -r ios/build/Build/Products/Release-iphoneos/*.app Payload/', { stdio: 'inherit' });
  execSync('zip -r PhotoDrop.ipa Payload', { stdio: 'inherit' });
  console.log('✅ IPA успешно создан!');
} catch (e) {
  console.error('❌ Ошибка сборки');
  process.exit(1);
}