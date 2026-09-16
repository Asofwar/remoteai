import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

export function TotpServiceIcon({ issuer }: { issuer: string }) {
  const name = issuer.trim().toLowerCase();
  if (name === 'github') return <View style={styles.github}>
    <Ionicons name="logo-github" size={44} color="#202322" />
  </View>;
  if (['aws', 'amazon web services', 'amazon'].includes(name)) return <View style={styles.aws}>
    <FontAwesome5 name="aws" size={32} color="#18364d" />
  </View>;
  return <View style={styles.initialBadge}>
    <Text style={styles.initial}>{Array.from(issuer.trim())[0]?.toLocaleUpperCase() ?? '?'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  github: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  aws: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderRadius: 12, borderWidth: 1, borderColor: '#eef0f3', backgroundColor: '#fff',
  },
  initialBadge: {
    width: 44, height: 44, borderRadius: 11, backgroundColor: '#ff6b2a',
    alignItems: 'center', justifyContent: 'center',
  },
  initial: { color: '#fff', fontSize: 28, fontWeight: '700' },
});
