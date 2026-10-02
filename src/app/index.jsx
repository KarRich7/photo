import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Отдельный компонент для надежного воспроизведения видео в карточке
function SwiperVideoItem({ uri, isMuted }) {
  const player = useVideoPlayer(uri, (playerInstance) => {
    playerInstance.loop = true;
    playerInstance.muted = isMuted;
    playerInstance.play();
  });

  useEffect(() => {
    if (player) {
      player.muted = isMuted;
    }
  }, [isMuted, player]);

  return (
    <VideoView
      style={styles.cardImage}
      player={player}
      allowsFullscreen={false}
      nativeControls={false}
      contentFit="cover"
    />
  );
}

export default function HomeScreen() {
  const [currentScreen, setCurrentScreen] = useState('landing');
  const [hasPermission, setHasPermission] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const [albums, setAlbums] = useState([]);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(true);

  const [activeMode, setActiveMode] = useState({ type: 'all', title: 'Все фото' });
  const [activePhotoLimit, setActivePhotoLimit] = useState(100);

  const [photos, setPhotos] = useState([]);
  const [trashPhotos, setTrashPhotos] = useState([]);
  const [keptPhotos, setKeptPhotos] = useState([]);
  const [trashSize, setTrashSize] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [activeSwipe, setActiveSwipe] = useState(null);
  const [cardIndex, setCardIndex] = useState(0);

  // Состояние звука для видео
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const swiperRef = useRef(null);

  // Дизайн-токены "Obsidian Frosted UI" (Stitch MCP)
  const theme = isDarkMode
    ? {
        background: '#090A0F',
        surface: 'rgba(255, 255, 255, 0.05)',
        surfaceElevated: '#14161F',
        border: 'rgba(255, 255, 255, 0.12)',
        borderSubtle: 'rgba(255, 255, 255, 0.06)',
        text: '#FFFFFF',
        textMuted: '#8E90A6',
        primary: '#6366F1',
        primaryGlow: 'rgba(99, 102, 241, 0.25)',
        secondary: '#8B5CF6',
        danger: '#EF4444',
        dangerGlow: 'rgba(239, 68, 68, 0.2)',
        success: '#10B981',
        successGlow: 'rgba(16, 185, 129, 0.2)',
        glassPill: 'rgba(255, 255, 255, 0.08)',
        modalBg: '#10121B',
      }
    : {
        background: '#F6F7FB',
        surface: '#FFFFFF',
        surfaceElevated: '#FFFFFF',
        border: 'rgba(0, 0, 0, 0.08)',
        borderSubtle: 'rgba(0, 0, 0, 0.04)',
        text: '#0F172A',
        textMuted: '#64748B',
        primary: '#4F46E5',
        primaryGlow: 'rgba(79, 70, 229, 0.15)',
        secondary: '#7C3AED',
        danger: '#DC2626',
        dangerGlow: 'rgba(220, 38, 38, 0.15)',
        success: '#059669',
        successGlow: 'rgba(5, 150, 105, 0.15)',
        glassPill: 'rgba(0, 0, 0, 0.05)',
        modalBg: '#FFFFFF',
      };

  const requestPermissionAndFetchAlbums = async () => {
    setIsLoadingAlbums(true);
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
  };

  useEffect(() => {
    requestPermissionAndFetchAlbums();
  }, []);

  const loadPhotos = async (mode = activeMode, limit = activePhotoLimit) => {
    setIsFinished(false);
    setTrashPhotos([]);
    setKeptPhotos([]);
    setTrashSize(0);
    setActiveSwipe(null);
    setCardIndex(0);
    setActiveMode(mode);
    setActivePhotoLimit(limit);
    setPhotos([]);

    if (hasPermission) {
      setCurrentScreen('swipe');

      let options = {
        first: limit,
        mediaType: mode.type === 'video' ? 'video' : ['photo', 'video'],
        sortBy: ['creationTime'],
      };

      if (mode.type === 'album') {
        options.album = mode.id;
      }

      try {
        const media = await MediaLibrary.getAssetsAsync(options);
        let processedAssets = [...media.assets];

        // Перемешивание для интересного процесса уборки
        for (let i = processedAssets.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [processedAssets[i], processedAssets[j]] = [processedAssets[j], processedAssets[i]];
        }

        setPhotos(processedAssets);
      } catch (err) {
        console.log('Ошибка загрузки медиа', err);
      }
    } else {
      await requestPermissionAndFetchAlbums();
    }
  };

  const onSwipeLeft = async (index) => {
    const photo = photos[index];
    if (!photo) return;
    setCardIndex(index + 1);
    setTrashPhotos((prev) => [...prev, photo]);

    try {
      const info = await MediaLibrary.getAssetInfoAsync(photo);
      let exactSize = 0;

      if (info.localUri) {
        const fileInfo = await FileSystem.getInfoAsync(info.localUri);
        exactSize = fileInfo.size || 0;
      }

      if (!exactSize || exactSize === 0) {
        exactSize = photo.mediaType === 'video' ? 18000000 : 3500000;
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
    setCardIndex(index + 1);
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
    if (x < -18 && activeSwipe !== 'left') setActiveSwipe('left');
    else if (x > 18 && activeSwipe !== 'right') setActiveSwipe('right');
    else if (Math.abs(x) <= 18 && activeSwipe !== null) setActiveSwipe(null);
  };

  // ===================== 1. ГЛАВНЫЙ ЭКРАН (LANDING) =====================
  if (currentScreen === 'landing') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ScrollView
          contentContainerStyle={styles.landingContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Glass Header */}
          <View style={[styles.glassHeader, { borderColor: theme.borderSubtle }]}>
            <View style={styles.brandRow}>
              <View style={[styles.logoIconContainer, { backgroundColor: theme.primaryGlow }]}>
                <Ionicons name="sparkles" size={20} color={theme.primary} />
              </View>
              <Text style={[styles.brandTitle, { color: theme.text }]}>PhotoDrop</Text>
            </View>

            <View style={styles.headerControls}>
              <View style={[styles.themePill, { backgroundColor: theme.glassPill }]}>
                <Ionicons
                  name={isDarkMode ? 'moon' : 'sunny'}
                  size={16}
                  color={isDarkMode ? '#A5B4FC' : '#F59E0B'}
                  style={{ marginRight: 6 }}
                />
                <Switch
                  value={isDarkMode}
                  onValueChange={setIsDarkMode}
                  trackColor={{ false: '#CBD5E1', true: theme.primary }}
                  thumbColor="#FFFFFF"
                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                />
              </View>
            </View>
          </View>

          {/* Hero Section */}
          <View style={styles.heroSection}>
            <View style={[styles.badgePill, { backgroundColor: theme.primaryGlow }]}>
              <Text style={[styles.badgeText, { color: theme.primary }]}>УМНАЯ ОЧИСТКА ГАЛЕРЕИ</Text>
            </View>
            <Text style={[styles.heroHeading, { color: theme.text }]}>
              Освободите место{'\n'}в один <Text style={{ color: theme.primary }}>свайп</Text>
            </Text>
            <Text style={[styles.heroSubheading, { color: theme.textMuted }]}>
              Быстро просматривайте и удаляйте ненужные снимки и тяжелые видеозаписи.
            </Text>
          </View>

          {/* Quick Action Modes */}
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>РЕЖИМЫ РАБОТЫ</Text>
          <View style={styles.modesContainer}>
            {/* Mode: All Photos */}
            <TouchableOpacity
              activeOpacity={0.82}
              style={[
                styles.modeCard,
                { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
              ]}
              onPress={() => loadPhotos({ type: 'all', title: 'Все фото' }, 100)}
            >
              <View style={[styles.modeIconCircle, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                <Ionicons name="images" size={26} color={theme.primary} />
              </View>
              <View style={styles.modeTextCol}>
                <View style={styles.modeRowBetween}>
                  <Text style={[styles.modeTitle, { color: theme.text }]}>Все медиа</Text>
                  <View style={[styles.tagPill, { backgroundColor: theme.glassPill }]}>
                    <Text style={[styles.tagPillText, { color: theme.primary }]}>Быстрый старт</Text>
                  </View>
                </View>
                <Text style={[styles.modeDesc, { color: theme.textMuted }]}>
                  Случайная выборка фото и видео из всей галереи
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>

            {/* Mode: Video Only */}
            <TouchableOpacity
              activeOpacity={0.82}
              style={[
                styles.modeCard,
                { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
              ]}
              onPress={() => loadPhotos({ type: 'video', title: 'Только Видео' }, 50)}
            >
              <View style={[styles.modeIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                <Ionicons name="videocam" size={26} color={theme.danger} />
              </View>
              <View style={styles.modeTextCol}>
                <View style={styles.modeRowBetween}>
                  <Text style={[styles.modeTitle, { color: theme.text }]}>Только видео</Text>
                  <View style={[styles.tagPill, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                    <Text style={[styles.tagPillText, { color: theme.danger }]}>Максимум GB</Text>
                  </View>
                </View>
                <Text style={[styles.modeDesc, { color: theme.textMuted }]}>
                  Очистка самых тяжелых видеофайлов
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Smart Albums Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.textMuted, marginBottom: 0 }]}>
              ВАШИ АЛЬБОМЫ
            </Text>
            {albums.length > 0 && (
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>{albums.length} папок</Text>
            )}
          </View>

          {albums.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.albumsScrollContainer}
            >
              {albums.map((album) => (
                <TouchableOpacity
                  key={album.id}
                  activeOpacity={0.8}
                  style={[
                    styles.albumGlassCard,
                    { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
                  ]}
                  onPress={() =>
                    loadPhotos({ type: 'album', id: album.id, title: album.title }, 100)
                  }
                >
                  <View
                    style={[
                      styles.albumFolderIcon,
                      { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
                    ]}
                  >
                    <Ionicons name="folder-open" size={24} color={theme.success} />
                  </View>
                  <Text style={[styles.albumTitle, { color: theme.text }]} numberOfLines={1}>
                    {album.title}
                  </Text>
                  <View style={[styles.albumCountBadge, { backgroundColor: theme.glassPill }]}>
                    <Text style={[styles.albumCountText, { color: theme.textMuted }]}>
                      {album.assetCount} файлов
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View
              style={[
                styles.emptyAlbumsBox,
                { backgroundColor: theme.surface, borderColor: theme.borderSubtle },
              ]}
            >
              <Ionicons name="images-outline" size={32} color={theme.textMuted} />
              <Text style={[styles.emptyAlbumsText, { color: theme.textMuted }]}>
                {hasPermission === false
                  ? 'Нет доступа к медиатеке. Нажмите для запроса прав.'
                  : 'Загрузка альбомов...'}
              </Text>
              {hasPermission === false && (
                <TouchableOpacity
                  style={[styles.smallPrimaryBtn, { backgroundColor: theme.primary }]}
                  onPress={requestPermissionAndFetchAlbums}
                >
                  <Text style={styles.smallPrimaryBtnText}>Разрешить доступ</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ===================== 2. ЭКРАН ИТОГОВ (FINISHED) =====================
  if (isFinished) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: theme.background,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          },
        ]}
      >
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

        {/* Success Icon Disc */}
        <View style={[styles.finishIconDisc, { backgroundColor: theme.successGlow }]}>
          <Ionicons name="checkmark-circle" size={64} color={theme.success} />
        </View>

        <Text style={[styles.finishTitle, { color: theme.text }]}>Отличная уборка!</Text>
        <Text style={[styles.finishSubtitle, { color: theme.textMuted }]}>
          Все выбранные фото и видео отсортированы
        </Text>

        {/* Stats Summary Cards */}
        <View style={styles.finishStatsGrid}>
          <View
            style={[
              styles.finishStatCard,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
            ]}
          >
            <View style={[styles.miniStatusDot, { backgroundColor: theme.success }]} />
            <Text style={[styles.finishStatNumber, { color: theme.success }]}>
              {keptPhotos.length}
            </Text>
            <Text style={[styles.finishStatLabel, { color: theme.textMuted }]}>Оставлено</Text>
          </View>

          <View
            style={[
              styles.finishStatCard,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
            ]}
          >
            <View style={[styles.miniStatusDot, { backgroundColor: theme.danger }]} />
            <Text style={[styles.finishStatNumber, { color: theme.danger }]}>
              {trashPhotos.length}
            </Text>
            <Text style={[styles.finishStatLabel, { color: theme.textMuted }]}>В корзину</Text>
            <Text style={[styles.finishStatSize, { color: theme.danger }]}>
              {formatBytes(trashSize)}
            </Text>
          </View>
        </View>

        {/* Action Button: Check & Review Trash */}
        <TouchableOpacity
          activeOpacity={0.85}
          style={[
            styles.ctaLargeButton,
            { backgroundColor: trashPhotos.length > 0 ? theme.primary : theme.success },
          ]}
          onPress={() => setShowResultModal(true)}
        >
          <Text style={styles.ctaLargeButtonText}>
            {trashPhotos.length > 0
              ? `Проверить корзину (${formatBytes(trashSize)}) →`
              : 'Завершить просмотр'}
          </Text>
        </TouchableOpacity>

        {/* Return to Home */}
        <TouchableOpacity
          style={styles.returnHomeButton}
          onPress={() => setCurrentScreen('landing')}
        >
          <Ionicons name="arrow-back" size={18} color={theme.textMuted} style={{ marginRight: 6 }} />
          <Text style={[styles.returnHomeText, { color: theme.textMuted }]}>На главную</Text>
        </TouchableOpacity>

        {/* Modal: Review and Confirm Deletion */}
        <Modal visible={showResultModal} animationType="slide" transparent={true}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalSheet, { backgroundColor: theme.modalBg }]}>
              {/* Modal Drag Handle */}
              <View style={styles.modalDragHandle} />

              <View style={styles.modalHeaderRow}>
                <View>
                  <Text style={[styles.modalTitleText, { color: theme.text }]}>
                    К удалению: {formatBytes(trashSize)}
                  </Text>
                  <Text style={[styles.modalSubText, { color: theme.textMuted }]}>
                    Нажмите на кадр, если хотите восстановить его
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.modalCloseButton, { backgroundColor: theme.glassPill }]}
                  onPress={() => setShowResultModal(false)}
                >
                  <Ionicons name="close" size={20} color={theme.text} />
                </TouchableOpacity>
              </View>

              {/* Grid of Trash Photos */}
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                <View style={styles.trashGrid}>
                  {trashPhotos.length > 0 ? (
                    trashPhotos.map((photo, idx) => (
                      <TouchableOpacity
                        key={'trash-' + photo.id + '-' + idx}
                        activeOpacity={0.75}
                        style={styles.trashGridItem}
                        onPress={() => restorePhoto(photo)}
                      >
                        <Image source={{ uri: photo.uri }} style={styles.trashGridImage} />
                        {photo.fileSize > 0 && (
                          <View style={styles.trashSizeBadge}>
                            <Text style={styles.trashSizeBadgeText}>
                              {formatBytes(photo.fileSize)}
                            </Text>
                          </View>
                        )}
                        <View style={styles.trashActionBadge}>
                          <Ionicons name="arrow-undo" size={12} color="#FFFFFF" />
                        </View>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.emptyTrashState}>
                      <Ionicons name="checkmark-done-circle" size={48} color={theme.success} />
                      <Text style={[styles.emptyTrashText, { color: theme.textMuted }]}>
                        Список на удаление пуст
                      </Text>
                    </View>
                  )}
                </View>
              </ScrollView>

              {/* Confirm Deletion Bar */}
              <View style={styles.modalBottomBar}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.ctaLargeButton,
                    {
                      backgroundColor: trashPhotos.length > 0 ? theme.danger : theme.success,
                      width: '100%',
                    },
                  ]}
                  onPress={confirmDeletion}
                >
                  <Ionicons
                    name={trashPhotos.length > 0 ? 'trash' : 'checkmark'}
                    size={20}
                    color="#FFFFFF"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.ctaLargeButtonText}>
                    {trashPhotos.length > 0
                      ? `Удалить ${trashPhotos.length} объектов (${formatBytes(trashSize)})`
                      : 'Готово'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ===================== 3. ЭКРАН СВАЙПОВ (SWIPE DECK) =====================
  const swipeGlowBg =
    activeSwipe === 'left'
      ? isDarkMode
        ? 'rgba(239, 68, 68, 0.25)'
        : 'rgba(239, 68, 68, 0.15)'
      : activeSwipe === 'right'
      ? isDarkMode
        ? 'rgba(16, 185, 129, 0.25)'
        : 'rgba(16, 185, 129, 0.15)'
      : 'transparent';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {/* Dynamic Background Tint when swiping */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: swipeGlowBg, zIndex: -1 },
        ]}
        pointerEvents="none"
      />

      {/* Top Glass Navigation Bar */}
      <View style={styles.swipeTopBar}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.roundGlassNavBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
          onPress={() => setCurrentScreen('landing')}
        >
          <Ionicons name="close" size={22} color={theme.text} />
        </TouchableOpacity>

        {['all', 'video'].includes(activeMode.type) ? (
          <View style={[styles.limitSegmentPill, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            {[50, 100, 500].map((num) => {
              const isSelected = activePhotoLimit === num;
              return (
                <TouchableOpacity
                  key={num}
                  activeOpacity={0.8}
                  style={[
                    styles.segmentButton,
                    isSelected && { backgroundColor: theme.primary },
                  ]}
                  onPress={() => loadPhotos(activeMode, num)}
                >
                  <Text
                    style={[
                      styles.segmentButtonText,
                      { color: isSelected ? '#FFFFFF' : theme.textMuted },
                    ]}
                  >
                    {num}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={[styles.activeAlbumHeaderPill, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <Ionicons name="folder" size={14} color={theme.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.activeAlbumHeaderText, { color: theme.text }]} numberOfLines={1}>
              {activeMode.title}
            </Text>
          </View>
        )}

        <View style={[styles.counterGlassBadge, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
          <Text style={[styles.counterGlassBadgeText, { color: theme.primary }]}>
            {Math.min(cardIndex + 1, photos.length)} / {photos.length}
          </Text>
        </View>
      </View>

      {/* Swipe Deck Viewport */}
      <View style={styles.deckViewport}>
        {photos.length > 0 ? (
          <Swiper
            ref={swiperRef}
            cards={photos}
            renderCard={(card) => {
              if (!card) return null;
              const isVideo = card.mediaType === 'video';

              return (
                <View
                  style={[
                    styles.deckCard,
                    {
                      backgroundColor: theme.surfaceElevated,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  {isVideo ? (
                    <SwiperVideoItem uri={card.uri} isMuted={isVideoMuted} />
                  ) : (
                    <Image source={{ uri: card.uri }} style={styles.cardImage} contentFit="cover" />
                  )}

                  {/* Top Specular Gradient / Scrim */}
                  <View style={styles.cardTopScrim} pointerEvents="none" />

                  {/* Media Metadata Floating Badges */}
                  <View style={styles.cardFloatingHeader}>
                    {isVideo ? (
                      <View style={styles.videoBadgeRow}>
                        <View style={styles.videoPillBadge}>
                          <Ionicons name="videocam" size={14} color="#FFFFFF" />
                          <Text style={styles.videoPillText}>Видео</Text>
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          style={styles.soundToggleCircle}
                          onPress={() => setIsVideoMuted(!isVideoMuted)}
                        >
                          <Ionicons
                            name={isVideoMuted ? 'volume-mute' : 'volume-high'}
                            size={16}
                            color="#FFFFFF"
                          />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.photoTypeBadge}>
                        <Ionicons name="image-outline" size={13} color="#FFFFFF" />
                        <Text style={styles.photoTypeText}>Фото</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
            overlayLabels={{
              left: {
                title: 'В КОРЗИНУ',
                style: {
                  label: styles.overlayLabelPurge,
                  wrapper: styles.overlayWrapperLeft,
                },
              },
              right: {
                title: 'ОСТАВИТЬ',
                style: {
                  label: styles.overlayLabelKeep,
                  wrapper: styles.overlayWrapperRight,
                },
              },
            }}
            overlayOpacityHorizontalThreshold={18}
            onSwipedLeft={onSwipeLeft}
            onSwipedRight={onSwipeRight}
            onSwipedAll={() => setIsFinished(true)}
            onSwiping={handleSwiping}
            onSwiped={() => setActiveSwipe(null)}
            onSwipedAborted={() => setActiveSwipe(null)}
            cardIndex={0}
            backgroundColor="transparent"
            stackSize={3}
            stackSeparation={-14}
            stackScale={4}
            disableTopSwipe={true}
            disableBottomSwipe={true}
            marginTop={-20}
            cardVerticalMargin={15}
            animateOverlayLabelsOpacity={true}
          />
        ) : (
          <View style={styles.deckEmptyPlaceholder}>
            <Ionicons name="images-outline" size={54} color={theme.textMuted} />
            <Text style={[styles.deckEmptyText, { color: theme.text }]}>Медиафайлы не найдены</Text>
            <TouchableOpacity
              style={[styles.smallPrimaryBtn, { backgroundColor: theme.primary, marginTop: 16 }]}
              onPress={() => setCurrentScreen('landing')}
            >
              <Text style={styles.smallPrimaryBtnText}>Выбрать другой альбом</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Floating Action Dock (One-Handed Navigation) */}
      {photos.length > 0 && (
        <View style={styles.bottomFloatingDock}>
          {/* Action: Trash Left */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.dockActionButton, styles.dockTrashButton]}
            onPress={() => swiperRef.current && swiperRef.current.swipeLeft()}
          >
            <Ionicons name="trash-outline" size={26} color="#EF4444" />
          </TouchableOpacity>

          {/* Action: Counter / Info */}
          <View style={[styles.dockInfoBadge, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <Text style={[styles.dockInfoSub, { color: theme.textMuted }]}>СВАЙП</Text>
            <Text style={[styles.dockInfoMain, { color: theme.text }]}>
              {trashPhotos.length} в корзине
            </Text>
          </View>

          {/* Action: Keep Right */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.dockActionButton, styles.dockKeepButton]}
            onPress={() => swiperRef.current && swiperRef.current.swipeRight()}
          >
            <Ionicons name="heart" size={26} color="#10B981" />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// Стили Obsidian Frosted UI
const styles = StyleSheet.create({
  safeArea: { flex: 1 },

  // Landing Styles
  landingContainer: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 30 : 16,
    paddingBottom: 40,
  },
  glassHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  heroSection: {
    marginBottom: 30,
  },
  badgePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroHeading: {
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  heroSubheading: {
    fontSize: 15,
    lineHeight: 22,
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 14,
  },

  modesContainer: {
    gap: 14,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  modeIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  modeTextCol: {
    flex: 1,
  },
  modeRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    marginRight: 8,
  },
  modeTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  modeDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagPillText: {
    fontSize: 11,
    fontWeight: '700',
  },

  albumsScrollContainer: {
    paddingRight: 20,
    gap: 14,
  },
  albumGlassCard: {
    width: 145,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  albumFolderIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  albumTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  albumCountBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  albumCountText: {
    fontSize: 11,
    fontWeight: '600',
  },

  emptyAlbumsBox: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  emptyAlbumsText: {
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 12,
  },
  smallPrimaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  smallPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Swipe Screen Styles
  swipeTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    zIndex: 10,
  },
  roundGlassNavBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  limitSegmentPill: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 3,
  },
  segmentButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  segmentButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  activeAlbumHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: SCREEN_WIDTH * 0.45,
  },
  activeAlbumHeaderText: {
    fontSize: 13,
    fontWeight: '700',
  },
  counterGlassBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
  },
  counterGlassBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  deckViewport: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deckCard: {
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_HEIGHT * 0.68,
    borderRadius: 30,
    overflow: 'hidden',
    alignSelf: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 12,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardTopScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  cardFloatingHeader: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  videoBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  videoPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 5,
  },
  videoPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  soundToggleCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  photoTypeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },

  overlayLabelPurge: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderColor: '#FFFFFF',
    color: '#FFFFFF',
    borderWidth: 2,
    borderRadius: 16,
    fontSize: 26,
    fontWeight: '900',
    paddingHorizontal: 16,
    paddingVertical: 8,
    overflow: 'hidden',
    transform: [{ rotate: '-12deg' }],
  },
  overlayWrapperLeft: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    marginTop: 40,
    marginLeft: 30,
  },
  overlayLabelKeep: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    borderColor: '#FFFFFF',
    color: '#FFFFFF',
    borderWidth: 2,
    borderRadius: 16,
    fontSize: 26,
    fontWeight: '900',
    paddingHorizontal: 16,
    paddingVertical: 8,
    overflow: 'hidden',
    transform: [{ rotate: '12deg' }],
  },
  overlayWrapperRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    marginTop: 40,
    marginRight: 30,
  },

  deckEmptyPlaceholder: {
    alignItems: 'center',
    padding: 30,
  },
  deckEmptyText: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },

  // Bottom Floating Action Dock
  bottomFloatingDock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingBottom: Platform.OS === 'android' ? 20 : 10,
    paddingTop: 10,
  },
  dockActionButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  dockTrashButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  dockKeepButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  dockInfoBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  dockInfoSub: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  dockInfoMain: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Finish Screen Styles
  finishIconDisc: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  finishTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: 6,
    textAlign: 'center',
  },
  finishSubtitle: {
    fontSize: 15,
    marginBottom: 30,
    textAlign: 'center',
  },
  finishStatsGrid: {
    flexDirection: 'row',
    gap: 14,
    width: '100%',
    marginBottom: 30,
  },
  finishStatCard: {
    flex: 1,
    padding: 20,
    borderRadius: 22,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  miniStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 10,
  },
  finishStatNumber: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  finishStatLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  finishStatSize: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
  },
  ctaLargeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 18,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  ctaLargeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  returnHomeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    padding: 10,
  },
  returnHomeText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    height: '84%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 20,
  },
  modalDragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitleText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  modalSubText: {
    fontSize: 12,
    marginTop: 3,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trashGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: 20,
  },
  trashGridItem: {
    width: '31%',
    height: 110,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  trashGridImage: {
    width: '100%',
    height: '100%',
  },
  trashSizeBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trashSizeBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  trashActionBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTrashState: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTrashText: {
    fontSize: 15,
    marginTop: 10,
  },
  modalBottomBar: {
    paddingTop: 12,
    paddingBottom: Platform.OS === 'android' ? 10 : 20,
  },
});