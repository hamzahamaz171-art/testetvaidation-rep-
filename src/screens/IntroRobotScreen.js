import React, { useMemo, useState, useCallback, useEffect, createElement } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Asset } from 'expo-asset';
import GradientBackground from '../components/GradientBackground';
import AppLogo from '../components/AppLogo';
import { makeCommon } from '../theme/styles';
import { useThemeColors } from '../theme/useThemeColors';
import { useTheme } from '../theme/ThemeContext';
import PageDots from '../components/PageDots';

/** Intro welcome clip — `assets/welcomm.webm` (VP8/VP9 WebM; excellent sur web & Android; iOS peut exiger un MP4 de secours). */
const WELCOME_VIDEO = require('../../assets/welcomm.webm');

/**
 * Extrait largeur/hauteur d’affichage (natif : naturalSize + orientation, web : HTMLVideoElement).
 * Certaines pistes ont width/height « bruts » inversés par rapport à l’image affichée (rotation).
 */
function readNaturalSize(ev) {
  if (!ev) return null;
  const ns = ev.naturalSize;
  if (ns?.width > 0 && ns?.height > 0) {
    let w = ns.width;
    let h = ns.height;
    if (ns.orientation === 'portrait' && w > h) {
      [w, h] = [h, w];
    }
    if (ns.orientation === 'landscape' && h > w) {
      [w, h] = [h, w];
    }
    return { width: w, height: h };
  }
  const inner = ev.nativeEvent;
  if (inner?.naturalSize?.width > 0 && inner?.naturalSize?.height > 0) {
    const n = inner.naturalSize;
    let w = n.width;
    let h = n.height;
    if (n.orientation === 'portrait' && w > h) [w, h] = [h, w];
    if (n.orientation === 'landscape' && h > w) [w, h] = [h, w];
    return { width: w, height: h };
  }
  const target = ev.target ?? inner?.target ?? ev.currentTarget;
  const vw = target?.videoWidth;
  const vh = target?.videoHeight;
  if (vw > 0 && vh > 0) return { width: vw, height: vh };
  return null;
}

/**
 * Sur le web : lecteur HTML natif.
 * En thème sombre, `mixBlendMode: multiply` fait que le blanc de la vidéo se fond dans le dégradé (le blanc du MP4 disparaît visuellement).
 */
function WebWelcomeVideo({ width, height, onNaturalSize, blendWhiteAway }) {
  const [uri, setUri] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const asset = Asset.fromModule(WELCOME_VIDEO);
        await asset.downloadAsync();
        if (alive) setUri(asset.localUri || asset.uri);
      } catch (e) {
        if (__DEV__) console.warn('[IntroRobot] video asset', e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!uri) {
    return (
      <View
        style={{
          width,
          height,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator color="rgba(230,237,255,0.5)" />
      </View>
    );
  }

  return createElement('video', {
    src: uri,
    autoPlay: true,
    muted: true,
    loop: true,
    playsInline: true,
    controls: false,
    disablePictureInPicture: true,
    style: {
      width,
      height,
      display: 'block',
      objectFit: 'contain',
      objectPosition: 'center center',
      backgroundColor: 'transparent',
      ...(blendWhiteAway ? { mixBlendMode: 'multiply' } : null),
    },
    onLoadedMetadata: (e) => {
      const el = e?.target;
      if (el?.videoWidth > 0 && el?.videoHeight > 0) {
        onNaturalSize({ width: el.videoWidth, height: el.videoHeight });
      }
    },
  });
}

export default function IntroRobotScreen({ navigation }) {
  const c = useThemeColors();
  const { theme } = useTheme();
  const common = makeCommon(c);
  const { width: sw, height: sh } = useWindowDimensions();
  const [naturalPx, setNaturalPx] = useState(null);
  const blendWhiteAway = theme === 'dark';

  /**
   * Cadre aux mêmes proportions que la vidéo (une fois les métadonnées connues),
   * borné pour tenir dans l’écran : CONTAIN remplit ce cadre → toute la vidéo est visible, sans recadrage.
   * Avant chargement : ratio 16/9 par défaut (souvent correct pour les clips paysage).
   */
  const videoSize = useMemo(() => {
    const aspect =
      naturalPx && naturalPx.width > 0 && naturalPx.height > 0
        ? naturalPx.width / naturalPx.height
        : 16 / 9;
    const maxW = Math.min(Math.max(220, sw - 56), 820);
    const maxH = Math.min(Math.round(sh * 0.56), 520);
    let w = maxW;
    let h = Math.round(w / aspect);
    if (h > maxH) {
      h = maxH;
      w = Math.round(h * aspect);
    }
    return { width: w, height: h };
  }, [sw, sh, naturalPx]);

  const onReadyForDisplay = useCallback((ev) => {
    const n = readNaturalSize(ev);
    if (n) setNaturalPx(n);
  }, []);

  return (
    <GradientBackground>
      <AppLogo size={44} style={{ position: 'absolute', top: 18, left: 18, opacity: 0.95 }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={[
          common.container,
          {
            justifyContent: 'center',
            flexGrow: 1,
            alignItems: 'center',
            backgroundColor: 'transparent',
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Vidéo sur le dégradé du template — hors carte (plus de fond blanc autour). */}
        <View
          style={{
            width: videoSize.width,
            height: videoSize.height,
            maxWidth: '100%',
            maxHeight: videoSize.height,
            overflow: 'visible',
            alignSelf: 'center',
            backgroundColor: 'transparent',
            ...(blendWhiteAway && Platform.OS !== 'web' ? { mixBlendMode: 'multiply' } : null),
          }}
        >
          {Platform.OS === 'web' ? (
            <WebWelcomeVideo
              width={videoSize.width}
              height={videoSize.height}
              onNaturalSize={setNaturalPx}
              blendWhiteAway={blendWhiteAway}
            />
          ) : (
            <Video
              source={WELCOME_VIDEO}
              style={{
                width: videoSize.width,
                height: videoSize.height,
                backgroundColor: 'transparent',
              }}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              isLooping
              isMuted
              useNativeControls={false}
              usePoster={false}
              onReadyForDisplay={onReadyForDisplay}
            />
          )}
        </View>

        <View style={{ width: '100%', maxWidth: 520, alignItems: 'center', backgroundColor: 'transparent' }}>
          <Text style={[common.title, { fontSize: 26, marginTop: 18 }]}>Hi! I'm your smart robot 🤖</Text>
          <Text style={[common.subtitle, { marginTop: 8, textAlign: 'center', paddingHorizontal: 4 }]}>
            “Hello! Welcome to our smart advertising robot app.”{"\n"}
            “I can guide customers and show promotions inside indoor places.”{"\n"}
            “Let’s explore together!”
          </Text>

          <View style={{ height: 18 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <PageDots index={0} total={3} />
            <TouchableOpacity onPress={() => navigation.navigate('IntroIdeas')}>
              <Text style={{ color: c.orange, fontWeight: '900', fontSize: 16 }}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </GradientBackground>
  );
}
