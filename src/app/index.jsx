import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import Swiper from 'react-native-deck-swiper';

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Асинхронное получение локального воспроизводимого файла видео в песочницу приложения
const resolveVideoAsset = async (asset) => {
  if (!asset || asset.mediaType !== 'video') return null;
  if (asset.localUri) return asset.localUri;

  try {
    const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: true });
    if (info && info.localUri) {
      const safeId = (asset.id || 'v').replace(/[^a-zA-Z0-9]/g, '_');
      const cachePath = `${FileSystem.cacheDirectory}v_${safeId}.mov`;
      try {
        const fileInfo = await FileSystem.getInfoAsync(cachePath);
        if (!fileInfo.exists) {
          await FileSystem.copyAsync({ from: info.localUri, to: cachePath });
        }
        asset.localUri = cachePath;
        return cachePath;
      } catch (copyErr) {
        asset.localUri = info.localUri;
        return info.localUri;
      }
    }
  } catch (err) {
    console.log('Error resolving video asset info:', err);
  }
  return null;
};

// Отдельный компонент для корректной работы видеоплеера в карусели
function SwiperVideoItem({ card, isMuted }) {
  const [playableUri, setPlayableUri] = useState(card?.localUri || null);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function prepareVideo() {
      if (card?.localUri) {
        if (isMounted) setPlayableUri(card.localUri);
        return;
      }
      const uri = await resolveVideoAsset(card);
      if (isMounted && uri) {
        setPlayableUri(uri);
      }
    }
    prepareVideo();
    return () => {
      isMounted = false;
    };
  }, [card?.id]);

  const player = useVideoPlayer(playableUri, (playerInstance) => {
    playerInstance.loop = true;
    playerInstance.muted = isMuted;
    try {
      playerInstance.audioMixingMode = 'mixWithOthers';
    } catch (e) {}
    if (playableUri) {
      playerInstance.play();
    }
  });

  // Запуск и замена источника при готовности локального пути
  useEffect(() => {
    if (player && playableUri) {
      try {
        player.replace(playableUri);
        player.play();
      } catch (e) {}
    }
  }, [player, playableUri]);

  // Автозапуск при готовности к воспроизведению и отслеживание статуса
  useEffect(() => {
    if (!player) return;

    if (player.status === 'readyToPlay') {
      player.play();
      setIsPlaying(true);
    }

    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        player.play();
        setIsPlaying(true);
      }
    });

    const playSub = player.addListener('playingChange', ({ isPlaying: playing }) => {
      setIsPlaying(playing);
    });

    return () => {
      sub?.remove();
      playSub?.remove();
    };
  }, [player]);

  // Обновляем состояние звука при переключении кнопки
  useEffect(() => {
    if (player) {
      player.muted = isMuted;
    }
  }, [isMuted, player]);

  const togglePlay = () => {
    if (!player) return;
    if (player.playing) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      style={styles.cardImage}
      onPress={togglePlay}
    >
      <Image
        source={{ uri: card.uri }}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
      />
      {playableUri && (
        <VideoView
          style={StyleSheet.absoluteFillObject}
          player={player}
          allowsFullscreen={false}
          nativeControls={false}
          contentFit="cover"
        />
      )}
      {!isPlaying && (
        <View style={styles.videoPausedOverlay} pointerEvents="none">
          <Ionicons name="play" size={54} color="rgba(255, 255, 255, 0.9)" />
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const [currentScreen, setCurrentScreen] = useState('landing');
  const [hasPermission, setHasPermission] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const [albums, setAlbums] = useState([]);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(true);

  const [activeMode, setActiveMode] = useState({ type: 'all', title: 'Вся галерея' });
  const [activePhotoLimit, setActivePhotoLimit] = useState(100);

  const [photos, setPhotos] = useState([]);
  const [trashPhotos, setTrashPhotos] = useState([]);
  const [keptPhotos, setKeptPhotos] = useState([]);
  const [trashSize, setTrashSize] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [activeSwipe, setActiveSwipe] = useState(null);

  // Состояние звука для видео (false = со звуком по умолчанию)
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const swiperRef = useRef(null);

  const theme = isDarkMode
    ? {
        background: '#0B0B0E',
        surface: '#1A1A24',
        cardBorder: 'rgba(255, 255, 255, 0.08)',
        text: '#FFFFFF',
        textMuted: '#8A8A93',
        primary: '#A37BFF',
        danger: '#FF4B4B',
        success: '#4CD964',
      }
    : {
        background: '#F5F5F7',
        surface: '#FFFFFF',
        cardBorder: 'rgba(0, 0, 0, 0.06)',
        text: '#1C1C1E',
        textMuted: '#8E8E93',
        primary: '#8A4FFF',
        danger: '#FF3B30',
        success: '#34C759',
      };

  useEffect(() => {
    (async () => {
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        setHasPermission(status === 'granted');

        if (status === 'granted') {
          const fetchedAlbums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
          const nonEmptyAlbums = fetchedAlbums
            .filter((a) => a.assetCount > 0)
            .sort((a, b) => b.assetCount - a.assetCount);

          setAlbums(nonEmptyAlbums);
        }
      } catch (err) {
        console.log('Ошибка при запросе разрешений', err);
      } finally {
        setIsLoadingAlbums(false);
      }
    })();
  }, []);

  const loadPhotos = async (mode = activeMode, limit = activePhotoLimit) => {
    setIsFinished(false);
    setTrashPhotos([]);
    setKeptPhotos([]);
    setTrashSize(0);
    setActiveSwipe(null);
    setActiveMode(mode);
    setActivePhotoLimit(limit);
    setPhotos([]);

    if (hasPermission) {
      setCurrentScreen('swipe');

      const mediaType = mode.type === 'video' ? 'video' : ['photo', 'video'];
      const album = mode.type === 'album' ? mode.id : undefined;

      try {
        // Проверяем общее количество медиафайлов
        const countCheck = await MediaLibrary.getAssetsAsync({
          first: 1,
          mediaType,
          album,
        });
        const totalCount = countCheck.totalCount || 0;

        let selectedAssets = [];

        if (totalCount <= limit) {
          const res = await MediaLibrary.getAssetsAsync({
            first: Math.max(1, totalCount),
            mediaType,
            album,
          });
          selectedAssets = [...res.assets];
        } else if (totalCount <= 1200) {
          const res = await MediaLibrary.getAssetsAsync({
            first: totalCount,
            mediaType,
            album,
          });
          selectedAssets = [...res.assets];
        } else {
          // Для больших галерей: запрашиваем диапазон дат от самых старых до самых новых
          const [newestRes, oldestRes] = await Promise.all([
            MediaLibrary.getAssetsAsync({ first: 1, mediaType, album, sortBy: [['creationTime', false]] }),
            MediaLibrary.getAssetsAsync({ first: 1, mediaType, album, sortBy: [['creationTime', true]] }),
          ]);

          const newestTime = newestRes.assets[0]?.creationTime || Date.now();
          const oldestTime = oldestRes.assets[0]?.creationTime || (newestTime - 5 * 365 * 24 * 3600 * 1000);
          const timeSpan = Math.max(1000, newestTime - oldestTime);

          // Генерируем 8-10 случайных временных срезов по всей истории
          const slicesCount = Math.min(10, Math.max(5, Math.ceil(limit / 20)));
          const batchSize = Math.ceil((limit * 1.8) / slicesCount);

          const randomTimestamps = [];
          for (let s = 0; s < slicesCount; s++) {
            const randOffset = Math.random() * timeSpan;
            randomTimestamps.push(oldestTime + randOffset);
          }

          const slicePromises = randomTimestamps.map((t) =>
            MediaLibrary.getAssetsAsync({
              first: batchSize,
              mediaType,
              album,
              createdBefore: t,
              sortBy: ['creationTime'],
            })
          );

          const sliceResults = await Promise.all(slicePromises);
          const idMap = new Map();

          for (const sRes of sliceResults) {
            for (const asset of sRes.assets) {
              if (!idMap.has(asset.id)) {
                idMap.set(asset.id, asset);
              }
            }
          }

          selectedAssets = Array.from(idMap.values());

          // Добираем при необходимости из общего пула
          if (selectedAssets.length < limit) {
            const fallback = await MediaLibrary.getAssetsAsync({
              first: limit,
              mediaType,
              album,
            });
            for (const asset of fallback.assets) {
              if (!idMap.has(asset.id)) {
                idMap.set(asset.id, asset);
              }
            }
            selectedAssets = Array.from(idMap.values());
          }
        }

        // Перемешивание по алгоритму Фишера-Йетса
        for (let i = selectedAssets.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [selectedAssets[i], selectedAssets[j]] = [selectedAssets[j], selectedAssets[i]];
        }

        const finalPhotos = selectedAssets.slice(0, limit);
        setPhotos(finalPhotos);

        // Фоновая предварительная подготовка видеофайлов для первых карточек
        finalPhotos
          .filter((a) => a.mediaType === 'video')
          .slice(0, 3)
          .forEach((v) => {
            resolveVideoAsset(v);
          });
      } catch (err) {
        console.log('Ошибка загрузки медиа', err);
      }
    }
  };

  const onSwipeLeft = async (index) => {
    const photo = photos[index];
    if (!photo) return;
    setTrashPhotos((prev) => [...prev, photo]);

    try {
      const info = await MediaLibrary.getAssetInfoAsync(photo);
      let exactSize = 0;

      if (info.localUri) {
        const fileInfo = await FileSystem.getInfoAsync(info.localUri);
        exactSize = fileInfo.size || 0;
      }

      if (!exactSize || exactSize === 0) {
        exactSize = photo.mediaType === 'video' ? 15000000 : 3500000;
      }

      setTrashSize((prev) => prev + exactSize);
      setTrashPhotos((current) =>
        current.map((p) => (p.id === photo.id ? { ...p, fileSize: exactSize } : p))
      );
    } catch (err) {
      console.log('Ошибка получения точного размера', err);
    }
  };

  const onSwipeRight = (index) => {
    const photo = photos[index];
    if (!photo) return;
    setKeptPhotos((prev) => [...prev, photo]);
  };

  const restorePhoto = (photoToRestore) => {
    setTrashPhotos((prev) => prev.filter((p) => p.id !== photoToRestore.id));
    setTrashSize((prev) => Math.max(0, prev - (photoToRestore.fileSize || 0)));
    setKeptPhotos((prev) => [...prev, photoToRestore]);
  };

  const confirmDeletion = async () => {
    if (trashPhotos.length > 0) {
      try {
        await MediaLibrary.deleteAssetsAsync(trashPhotos);
      } catch (error) {
        console.log('Ошибка при удалении', error);
      }
    }
    setShowResultModal(false);
    setCurrentScreen('landing');
  };

  const handleSwiping = (x) => {
    if (x < -15 && activeSwipe !== 'left') setActiveSwipe('left');
    else if (x > 15 && activeSwipe !== 'right') setActiveSwipe('right');
    else if (Math.abs(x) <= 15 && activeSwipe !== null) setActiveSwipe(null);
  };

  // ===================== 1. ГЛАВНЫЙ ЭКРАН =====================
  if (currentScreen === 'landing') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ScrollView contentContainerStyle={styles.landingContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={[styles.logoText, { color: theme.text }]}>PhotoDrop</Text>

              <Image
                source={require('../../assets/logo.png')}
                style={{ width: 32, height: 32, borderRadius: 8 }}
                contentFit="contain"
              />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Switch
                value={isDarkMode}
                onValueChange={setIsDarkMode}
                trackColor={{ false: '#CBD5E1', true: theme.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          <Text style={[styles.mainTitle, { color: theme.text, marginTop: 20 }]}>
            Очистите <Text style={{ color: theme.primary }}>ГАЛЕРЕЮ</Text> легко.
          </Text>

          <Text style={styles.sectionTitle}>Быстрый старт</Text>
          <View style={styles.modesContainer}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.modeButton, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
              onPress={() => loadPhotos({ type: 'all', title: 'Вся галерея' }, 100)}
            >
              <View style={[styles.modeIconBg, { backgroundColor: 'rgba(163, 123, 255, 0.15)' }]}>
                <Ionicons name="images" size={24} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modeTitle, { color: theme.text }]}>Вся галерея</Text>
                <Text style={[styles.modeDesc, { color: theme.textMuted }]}>Случайные фото и видео</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.modeButton, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
              onPress={() => loadPhotos({ type: 'video', title: 'Только Видео' }, 50)}
            >
              <View style={[styles.modeIconBg, { backgroundColor: 'rgba(255, 75, 75, 0.15)' }]}>
                <Ionicons name="videocam" size={24} color={theme.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modeTitle, { color: theme.text }]}>Только Видео</Text>
                <Text style={[styles.modeDesc, { color: theme.textMuted }]}>Освободите максимум места</Text>
              </View>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 35 }]}>Ваши альбомы</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -24, paddingHorizontal: 24, paddingBottom: 20 }}
          >
            {albums.map((album) => (
              <TouchableOpacity
                key={album.id}
                activeOpacity={0.8}
                style={[styles.albumCard, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
                onPress={() => loadPhotos({ type: 'album', id: album.id, title: album.title }, 100)}
              >
                <View style={[styles.modeIconBg, { backgroundColor: 'rgba(76, 217, 100, 0.15)', marginBottom: 15 }]}>
                  <Ionicons name="folder" size={24} color={theme.success} />
                </View>
                <Text style={[styles.modeTitle, { color: theme.text }]} numberOfLines={1}>
                  {album.title}
                </Text>
                <Text style={[styles.modeDesc, { color: theme.textMuted }]}>{album.assetCount} файлов</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ===================== 2. ЭКРАН ИТОГОВ =====================
  if (isFinished) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: 20 },
        ]}
      >
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <Text style={[styles.mainTitle, { color: theme.text, textAlign: 'center', fontSize: 32 }]}>
          Отличная уборка.
        </Text>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
            <Text style={{ fontSize: 28, color: theme.success, fontWeight: 'bold' }}>{keptPhotos.length}</Text>
            <Text style={{ color: theme.textMuted, marginTop: 5 }}>Оставлено</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
            <Text style={{ fontSize: 28, color: theme.danger, fontWeight: 'bold' }}>{trashPhotos.length}</Text>
            <Text style={{ color: theme.textMuted, marginTop: 5 }}>На удаление</Text>
            <Text style={{ color: theme.danger, fontWeight: 'bold', marginTop: 5 }}>{formatBytes(trashSize)}</Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.primaryButton, { backgroundColor: theme.primary, width: '100%' }]}
          onPress={() => setShowResultModal(true)}
        >
          <Text style={styles.primaryButtonText}>Проверить результат →</Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ marginTop: 18 }} onPress={() => setCurrentScreen('landing')}>
          <Text style={{ color: theme.textMuted, fontSize: 16 }}>На главную</Text>
        </TouchableOpacity>

        <Modal visible={showResultModal} animationType="slide" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>
                    Удалить: {formatBytes(trashSize)}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                    Нажмите на фото, чтобы вернуть его
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowResultModal(false)}>
                  <Ionicons name="close" size={28} color={theme.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true}>
                <View style={styles.gridContainer}>
                  {trashPhotos.length > 0 ? (
                    trashPhotos.map((photo, idx) => (
                      <TouchableOpacity
                        key={'del-' + idx}
                        style={styles.gridItem}
                        activeOpacity={0.7}
                        onPress={() => restorePhoto(photo)}
                      >
                        <Image source={{ uri: photo.uri }} style={styles.gridImage} />
                        {photo.fileSize > 0 && (
                          <View style={styles.sizeBadge}>
                            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>
                              {formatBytes(photo.fileSize)}
                            </Text>
                          </View>
                        )}
                        <View style={styles.deleteBadgeTopRight}>
                          <Ionicons name="trash" size={14} color="#FFF" />
                        </View>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={{ color: theme.textMuted, marginVertical: 20 }}>Список на удаление пуст.</Text>
                  )}
                </View>
              </ScrollView>

              <View style={{ paddingTop: 15, paddingBottom: 30 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.primaryButton,
                    { backgroundColor: trashPhotos.length > 0 ? theme.danger : theme.success },
                  ]}
                  onPress={confirmDeletion}
                >
                  <Text style={styles.primaryButtonText}>
                    {trashPhotos.length > 0 ? 'Удалить навсегда' : 'Готово'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ===================== 3. ЭКРАН СВАЙПОВ =====================
  const currentScreenBg =
    activeSwipe === 'left' ? '#FF2A2A' : activeSwipe === 'right' ? '#0CDA53' : theme.background;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: currentScreenBg }]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.swipeHeader}>
        <TouchableOpacity onPress={() => setCurrentScreen('landing')}>
          <View style={styles.backButtonContainer}>
            <Ionicons name="close" size={32} color={activeSwipe ? '#FFF' : theme.textMuted} />
          </View>
        </TouchableOpacity>

        {['all', 'video'].includes(activeMode.type) ? (
          <View style={styles.inlineLimitContainer}>
            {[50, 100, 500].map((num) => (
              <TouchableOpacity
                key={num}
                activeOpacity={0.8}
                style={[
                  styles.smallLimitBtn,
                  { backgroundColor: activePhotoLimit === num ? theme.primary : 'rgba(255,255,255,0.1)' },
                ]}
                onPress={() => loadPhotos(activeMode, num)}
              >
                <Text
                  style={{
                    color: activePhotoLimit === num ? '#FFF' : theme.text,
                    fontSize: 13,
                    fontWeight: 'bold',
                  }}
                >
                  {num}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={{ color: theme.textMuted, fontWeight: 'bold', fontSize: 16 }}>{activeMode.title}</Text>
        )}
      </View>

      {activeMode.type === 'album' && (
        <Text
          style={{
            color: theme.text,
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 'bold',
            marginTop: 10,
          }}
        >
          Альбом: {activeMode.title}
        </Text>
      )}

      <View style={styles.swipeAreaContainer}>
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor:
                activeSwipe === 'left'
                  ? 'rgba(255, 30, 30, 0.7)'
                  : activeSwipe === 'right'
                  ? 'rgba(30, 255, 60, 0.6)'
                  : 'transparent',
              zIndex: -2,
            },
          ]}
        />

        <View style={styles.sideArrowLeft} pointerEvents="none">
          <Ionicons name="chevron-back" size={40} color={activeSwipe === 'left' ? '#FFF' : theme.textMuted} />
        </View>
        <View style={styles.sideArrowRight} pointerEvents="none">
          <Ionicons
            name="chevron-forward"
            size={40}
            color={activeSwipe === 'right' ? '#FFF' : theme.textMuted}
          />
        </View>

        {photos.length > 0 ? (
          <Swiper
            ref={swiperRef}
            cards={photos}
            renderCard={(card) => {
              if (!card) return null;
              const isVideo = card.mediaType === 'video';

              return (
                <View
                  key={card.id || card.uri}
                  style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
                >
                  {isVideo ? (
                    <SwiperVideoItem key={card.id || card.uri} card={card} isMuted={isVideoMuted} />
                  ) : (
                    <Image source={{ uri: card.uri }} style={styles.cardImage} contentFit="cover" />
                  )}

                  {isVideo && (
                    <View style={styles.videoHeaderBadge}>
                      <View style={styles.videoBadge}>
                        <Ionicons name="play" size={14} color="#FFF" />
                        <Text style={{ color: '#FFF', fontWeight: 'bold', marginLeft: 4, fontSize: 12 }}>
                          Видео
                        </Text>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        style={styles.soundButton}
                        onPress={() => setIsVideoMuted(!isVideoMuted)}
                      >
                        <Ionicons name={isVideoMuted ? 'volume-mute' : 'volume-high'} size={18} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }}
            overlayLabels={{
              left: {
                title: 'УДАЛИТЬ',
                style: {
                  label: styles.overlayLabelRed,
                  wrapper: styles.overlayWrapperTopLeft,
                },
              },
              right: {
                title: 'ОСТАВИТЬ',
                style: {
                  label: styles.overlayLabelGreen,
                  wrapper: styles.overlayWrapperTopRight,
                },
              },
            }}
            overlayOpacityHorizontalThreshold={15}
            onSwipedLeft={onSwipeLeft}
            onSwipedRight={onSwipeRight}
            onSwipedAll={() => setIsFinished(true)}
            onSwiping={handleSwiping}
            onSwiped={() => setActiveSwipe(null)}
            onSwipedAborted={() => setActiveSwipe(null)}
            cardIndex={0}
            keyExtractor={(card) => (card ? card.id || card.uri : Math.random().toString())}
            backgroundColor={'transparent'}
            stackSize={3}
            disableTopSwipe={true}
            disableBottomSwipe={true}
            marginTop={-15}
            cardVerticalMargin={20}
            animateOverlayLabelsOpacity={true}
          />
        ) : (
          <Text style={{ color: theme.text, alignSelf: 'center', marginTop: 100 }}>Ничего не найдено</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  landingContainer: { padding: 24, paddingTop: 30 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  logoText: { fontSize: 26, fontWeight: '900', letterSpacing: 0.5 },
  mainTitle: { fontSize: 34, fontWeight: '900', lineHeight: 40, marginBottom: 25 },
  sectionTitle: { color: '#8A8A93', fontSize: 16, marginBottom: 15, fontWeight: 'bold' },

  modesContainer: { gap: 15 },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  modeIconBg: {
    width: 50,
    height: 50,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  modeTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  modeDesc: { fontSize: 13 },

  albumCard: {
    width: 140,
    padding: 18,
    borderRadius: 20,
    marginRight: 15,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },

  primaryButton: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },

  swipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    zIndex: 10,
    paddingBottom: 10,
  },
  backButtonContainer: { width: 40, height: 40, justifyContent: 'center' },
  inlineLimitContainer: { flexDirection: 'row', gap: 8 },
  smallLimitBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 14 },

  swipeAreaContainer: { flex: 1, position: 'relative', justifyContent: 'center' },
  sideArrowLeft: { position: 'absolute', top: '48%', left: 5, marginTop: -20, zIndex: 10 },
  sideArrowRight: { position: 'absolute', top: '48%', right: 5, marginTop: -20, zIndex: 10 },

  card: {
    width: '90%',
    height: '82%',
    borderRadius: 30,
    overflow: 'hidden',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 15,
    borderWidth: 1,
    position: 'relative',
  },
  cardImage: { width: '100%', height: '100%' },

  videoHeaderBadge: {
    position: 'absolute',
    top: 15,
    left: 15,
    right: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  videoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 15,
  },
  soundButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },

  overlayLabelRed: {
    backgroundColor: 'transparent',
    borderColor: '#FF4B4B',
    color: '#FF4B4B',
    borderWidth: 5,
    borderRadius: 12,
    fontSize: 32,
    fontWeight: '900',
    padding: 10,
    transform: [{ rotate: '-15deg' }],
  },
  overlayWrapperTopLeft: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    marginTop: 40,
    marginLeft: 30,
  },

  overlayLabelGreen: {
    backgroundColor: 'transparent',
    borderColor: '#4CD964',
    color: '#4CD964',
    borderWidth: 5,
    borderRadius: 12,
    fontSize: 32,
    fontWeight: '900',
    padding: 10,
    transform: [{ rotate: '15deg' }],
  },
  overlayWrapperTopRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    marginTop: 40,
    marginLeft: -30,
  },

  statsRow: { flexDirection: 'row', gap: 15, width: '100%', marginVertical: 20 },
  statCard: {
    flex: 1,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: {
    height: '85%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: { fontSize: 22, fontWeight: 'bold' },

  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: 80,
  },
  gridItem: {
    width: '31%',
    height: 110,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    position: 'relative',
  },

  gridImage: { width: '100%', height: '100%' },
  sizeBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  deleteBadgeTopRight: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FF4B4B',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});