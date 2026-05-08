import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { COLORS } from '../theme';

const { width, height } = Dimensions.get('window');

export default function BullBearBackground() {
  const bullX = useRef(new Animated.Value(-100)).current;
  const bearX = useRef(new Animated.Value(width + 100)).current;
  const pitbullY = useRef(new Animated.Value(height + 50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(bullX, {
            toValue: width * 0.3,
            duration: 4000,
            useNativeDriver: true,
          }),
          Animated.timing(bullX, {
            toValue: width * 0.35,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(bullX, {
            toValue: width * 0.25,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(bullX, {
            toValue: -100,
            duration: 3000,
            useNativeDriver: true,
          }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(bearX, {
            toValue: width * 0.55,
            duration: 4000,
            useNativeDriver: true,
          }),
          Animated.timing(bearX, {
            toValue: width * 0.5,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(bearX, {
            toValue: width * 0.6,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(bearX, {
            toValue: width + 100,
            duration: 3000,
            useNativeDriver: true,
          }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pitbullY, {
            toValue: height * 0.15,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(pitbullY, {
            toValue: height * 0.12,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pitbullY, {
            toValue: height + 50,
            duration: 3000,
            useNativeDriver: true,
          }),
        ])
      ),
    ]).start();
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View
        style={[styles.animal, { transform: [{ translateX: bullX }], top: height * 0.4 }]}
      >
        <View style={[styles.shape, styles.bullBody]} />
        <View style={[styles.horn, styles.leftHorn]} />
        <View style={[styles.horn, styles.rightHorn]} />
      </Animated.View>

      <Animated.View
        style={[styles.animal, { transform: [{ translateX: bearX }], top: height * 0.42 }]}
      >
        <View style={[styles.shape, styles.bearBody]} />
        <View style={styles.bearEarLeft} />
        <View style={styles.bearEarRight} />
      </Animated.View>

      <Animated.View
        style={[styles.pitbull, { transform: [{ translateY: pitbullY }], left: width * 0.5 - 30 }]}
      >
        <View style={styles.pitbullBody} />
        <View style={styles.pitbullEarLeft} />
        <View style={styles.pitbullEarRight} />
      </Animated.View>

      <View style={styles.floor} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050505',
    overflow: 'hidden',
  },
  animal: {
    position: 'absolute',
  },
  shape: {
    borderRadius: 20,
  },
  bullBody: {
    width: 80,
    height: 60,
    backgroundColor: '#1a472a',
    borderWidth: 2,
    borderColor: '#2d6a4f',
  },
  horn: {
    position: 'absolute',
    width: 4,
    height: 25,
    backgroundColor: '#FFD700',
    top: -20,
    borderRadius: 2,
  },
  leftHorn: {
    left: 15,
    transform: [{ rotate: '-15deg' }],
  },
  rightHorn: {
    right: 15,
    transform: [{ rotate: '15deg' }],
  },
  bearBody: {
    width: 90,
    height: 70,
    backgroundColor: '#4a1c1c',
    borderWidth: 2,
    borderColor: '#6b2d2d',
    borderRadius: 25,
  },
  bearEarLeft: {
    position: 'absolute',
    width: 20,
    height: 20,
    backgroundColor: '#6b2d2d',
    borderRadius: 10,
    top: -10,
    left: 10,
  },
  bearEarRight: {
    position: 'absolute',
    width: 20,
    height: 20,
    backgroundColor: '#6b2d2d',
    borderRadius: 10,
    top: -10,
    right: 10,
  },
  pitbull: {
    position: 'absolute',
  },
  pitbullBody: {
    width: 60,
    height: 50,
    backgroundColor: '#8B7355',
    borderWidth: 2,
    borderColor: '#A0896C',
    borderRadius: 15,
  },
  pitbullEarLeft: {
    position: 'absolute',
    width: 15,
    height: 18,
    backgroundColor: '#6B5344',
    borderRadius: 8,
    top: -12,
    left: 8,
    transform: [{ rotate: '-10deg' }],
  },
  pitbullEarRight: {
    position: 'absolute',
    width: 15,
    height: 18,
    backgroundColor: '#6B5344',
    borderRadius: 8,
    top: -12,
    right: 8,
    transform: [{ rotate: '10deg' }],
  },
  floor: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 2,
    borderColor: '#2a2a2a',
  },
});
