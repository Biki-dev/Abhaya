
// ─────────────────────────────────────────────────────────────────────────────
// Shown on the SOS screen (and optionally on HomeMapScreen) after the police
// SMS attempt completes. Shows station name, distance, send status, and the
// results for each emergency contact SMS.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { PoliceSMSResult } from '../services/policeSOS';

type Props = {
  result:    PoliceSMSResult | null;
  loading:   boolean;
  onDismiss: () => void;
};

export default function PoliceAlertBanner({ result, loading, onDismiss }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loading || result) {
      Animated.timing(fadeAnim, {
        toValue:         1,
        duration:        300,
        useNativeDriver: true,
      }).start();
    }
  }, [loading, result]);

  if (!loading && !result) return null;

  const sent     = result?.sent      ?? false;
  const station  = result?.station;
  const contacts = result?.contactResults ?? [];

  const distText = station
    ? station.distance >= 1000
      ? `${(station.distance / 1000).toFixed(1)} km away`
      : `${station.distance} m away`
    : null;

  const contactsSent = contacts.filter((c) => c.sent).length;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>

      {/* ── Police status row ── */}
      <View style={styles.header}>
        <View style={[
          styles.iconWrap,
          { backgroundColor: loading ? '#F59E0B20' : sent ? '#10B98120' : '#EF444420' },
        ]}>
          {loading ? (
            <MaterialCommunityIcons name="radar" size={18} color="#F59E0B" />
          ) : sent ? (
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
          ) : (
            <Ionicons name="warning" size={18} color="#EF4444" />
          )}
        </View>

        <View style={styles.textBlock}>
          {loading ? (
            <Text style={styles.title}>Alerting police & emergency contacts…</Text>
          ) : sent ? (
            <Text style={styles.title}>
              Police SMS sent{station ? ` · ${station.name}` : ''}
            </Text>
          ) : (
            <Text style={[styles.title, { color: '#EF4444' }]}>
              Police SMS failed — try calling 100
            </Text>
          )}

          {!loading && station && (
            <Text style={styles.sub}>
              {station.name}
              {distText ? `  ·  ${distText}` : ''}
              {station.phone !== '100' ? `  ·  ${station.rawPhone ?? station.phone}` : ''}
            </Text>
          )}

          {!loading && !sent && result?.errorReason && (
            <Text style={styles.error} numberOfLines={2}>
              {result.errorReason}
            </Text>
          )}
        </View>

        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="close" size={16} color="#A0AEC0" />
        </TouchableOpacity>
      </View>

      {/* ── Station coords (when successful) ── */}
      {!loading && sent && station && (
        <View style={styles.detail}>
          <Ionicons name="location" size={13} color="#7C3AED" />
          <Text style={styles.detailText}>
            {`${station.lat.toFixed(5)}, ${station.lng.toFixed(5)}`}
          </Text>
          <View style={styles.dot} />
          <Text style={styles.detailText}>OSM station detected</Text>
        </View>
      )}

      {/* ── Emergency contacts SMS summary ── */}
      {!loading && contacts.length > 0 && (
        <View style={styles.contactsSection}>
          <View style={styles.contactsHeader}>
            <Ionicons
              name="people"
              size={13}
              color={contactsSent > 0 ? '#10B981' : '#EF4444'}
            />
            <Text style={styles.contactsTitle}>
              Emergency contacts alerted: {contactsSent}/{contacts.length}
            </Text>
          </View>

          {contacts.map((c, i) => (
            <View key={i} style={styles.contactRow}>
              <Ionicons
                name={c.sent ? 'checkmark-circle' : 'close-circle'}
                size={14}
                color={c.sent ? '#10B981' : '#EF4444'}
              />
              <Text style={styles.contactName}>{c.name}</Text>
              <Text style={styles.contactPhone}>{c.phone}</Text>
              {!c.sent && c.error && (
                <Text style={styles.contactErr} numberOfLines={1}>
                  {c.error.length > 40 ? c.error.substring(0, 40) + '…' : c.error}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* ── Loading state for contacts ── */}
      {loading && (
        <View style={styles.contactsSection}>
          <View style={styles.contactsHeader}>
            <MaterialCommunityIcons name="message-text" size={13} color="#F59E0B" />
            <Text style={styles.contactsTitle}>
              Sending SMS to emergency contacts…
            </Text>
          </View>
        </View>
      )}

      {/* ── Police message preview ── */}
      {!loading && result?.message && (
        <View style={styles.msgBox}>
          <Text style={styles.msgLabel}>Police message sent</Text>
          <Text style={styles.msgText} numberOfLines={6}>
            {result.message}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     '#E5E7EB',
    padding:         14,
    marginHorizontal: 0,
    shadowColor:     '#1A202C',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.08,
    shadowRadius:    4,
    elevation:       3,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    gap:            10,
  },
  iconWrap: {
    width:          34,
    height:         34,
    borderRadius:   10,
    justifyContent: 'center',
    alignItems:     'center',
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize:   13,
    fontFamily: 'Manrope_600SemiBold',
    color:      '#1A202C',
    lineHeight: 18,
  },
  sub: {
    fontSize:   11,
    fontFamily: 'Manrope_500Medium',
    color:      '#718096',
    marginTop:  3,
  },
  error: {
    fontSize:   11,
    fontFamily: 'Manrope_500Medium',
    color:      '#EF4444',
    marginTop:  3,
  },
  detail: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            5,
    marginTop:      10,
    paddingTop:     10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  detailText: {
    fontSize:   11,
    fontFamily: 'Manrope_500Medium',
    color:      '#A0AEC0',
  },
  dot: {
    width:           3,
    height:          3,
    borderRadius:    2,
    backgroundColor: '#D1D5DB',
  },
  // ── Contacts section ──
  contactsSection: {
    marginTop:      10,
    paddingTop:     10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  contactsHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    marginBottom:   6,
  },
  contactsTitle: {
    fontSize:   12,
    fontFamily: 'Manrope_600SemiBold',
    color:      '#1A202C',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    paddingVertical: 3,
  },
  contactName: {
    fontSize:   12,
    fontFamily: 'Manrope_600SemiBold',
    color:      '#374151',
    minWidth:   70,
  },
  contactPhone: {
    fontSize:   11,
    fontFamily: 'Manrope_500Medium',
    color:      '#9CA3AF',
    flex:       1,
  },
  contactErr: {
    fontSize:   10,
    fontFamily: 'Manrope_500Medium',
    color:      '#EF4444',
    flex:       1,
  },
  // ── Message box ──
  msgBox: {
    backgroundColor: '#F9FAFB',
    borderRadius:    8,
    padding:         10,
    marginTop:       10,
    borderWidth:     1,
    borderColor:     '#F3F4F6',
  },
  msgLabel: {
    fontSize:      10,
    fontFamily:    'Manrope_600SemiBold',
    color:         '#A0AEC0',
    marginBottom:  4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  msgText: {
    fontSize:   11,
    fontFamily: 'Manrope_500Medium',
    color:      '#4A5568',
    lineHeight: 17,
  },
});