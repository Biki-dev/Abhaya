// GuardianDashboardScreen - Live Map + Heartbeat Status
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../theme';

export default function GuardianDashboardScreen({ navigation }: any) {
  const [protectedPerson] = useState({
    name: 'Priya Singh',
    status: 'safe',
    lastUpdate: '2 mins ago',
    latitude: 28.7041,
    longitude: 77.1025,
  });

  const [heartbeatAnim] = useState(new Animated.Value(1));

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(heartbeatAnim, {
          toValue: 1.2,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(heartbeatAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  const alertHistory = [
    { id: 1, type: 'check-in', message: 'Reached office safely', time: '9:30 AM' },
    { id: 2, type: 'status', message: 'Location update received', time: '9:15 AM' },
    { id: 3, type: 'sos', message: 'SOS triggered in area', time: '8:45 AM' },
    { id: 4, type: 'check-in', message: 'Left home', time: '8:00 AM' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <View style={styles.backRow}>
            <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
            <Text style={styles.backButton}>Back</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Guardian Mode</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Live Map */}
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: protectedPerson.latitude,
            longitude: protectedPerson.longitude,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          }}
        >
          <Marker
            coordinate={{
              latitude: protectedPerson.latitude,
              longitude: protectedPerson.longitude,
            }}
            title={protectedPerson.name}
          >
            <View style={styles.marker}>
              <View style={styles.markerInner} />
            </View>
          </Marker>
        </MapView>

        {/* Person Info Card */}
        <View style={styles.personCard}>
          <View style={styles.personHeader}>
            <View style={styles.personAvatar}>
              <Text style={styles.avatarInitial}>P</Text>
            </View>
            <View style={styles.personInfo}>
              <Text style={styles.personName}>{protectedPerson.name}</Text>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color={colors.muted} />
                <Text style={styles.personLocation}>South Delhi</Text>
              </View>
            </View>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Status</Text>
              <Text style={styles.statusValue}>{protectedPerson.status}</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Last Update</Text>
              <Text style={styles.statusValue}>{protectedPerson.lastUpdate}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Heartbeat Health Indicator */}
      <View style={styles.healthSection}>
        <Text style={styles.sectionTitle}>Health Status</Text>
        <View style={styles.heartbeatContainer}>
          <Animated.View
            style={[styles.heartbeat, { transform: [{ scale: heartbeatAnim }] }]}
          >
            <Ionicons name="heart" size={24} color={colors.danger} />
          </Animated.View>
          <View style={styles.heartbeatInfo}>
            <Text style={styles.heartbeatLabel}>Heartbeat Active</Text>
            <Text style={styles.heartbeatStatus}>All sensors operational</Text>
          </View>
        </View>
      </View>

      {/* Alert History */}
      <View style={styles.historySection}>
        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle}>Alert History</Text>
          <TouchableOpacity>
            <Text style={styles.viewAll}>View All →</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.historyList}
        >
          {alertHistory.map((alert) => (
            <View key={alert.id} style={styles.alertItem}>
              <View style={styles.alertIcon}>
                {alert.type === 'check-in' && <Ionicons name="checkmark" size={16} color={colors.safe} />}
                {alert.type === 'status' && <Ionicons name="location" size={16} color={colors.primary} />}
                {alert.type === 'sos' && <MaterialCommunityIcons name="alarm-light" size={16} color={colors.danger} />}
              </View>
              <View style={styles.alertContent}>
                <Text style={styles.alertMessage}>{alert.message}</Text>
                <Text style={styles.alertTime}>{alert.time}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="call-outline" size={16} color={colors.text} />
          <Text style={styles.actionButtonText}>Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.text} />
          <Text style={styles.actionButtonText}>Message</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.emergencyButton]}>
          <MaterialCommunityIcons name="alarm-light-outline" size={16} color={colors.text} />
          <Text style={styles.emergencyButtonText}>Alert</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    shadowColor: '#1A202C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  backButton: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.heading,
    color: colors.text,
  },
  placeholder: {
    width: 30,
  },
  mapContainer: {
    height: 250,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 9999,
    backgroundColor: colors.safe,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerInner: {
    width: 10,
    height: 10,
    borderRadius: 9999,
    backgroundColor: colors.text,
  },
  personCard: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#1A202C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  personHeader: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  personAvatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  avatarInitial: {
    ...typography.heading,
    color: colors.text,
  },
  personInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  personName: {
    ...typography.subheading,
    color: colors.text,
  },
  personLocation: {
    ...typography.bodySmall,
    color: colors.muted,
  },
  locationRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  statusItem: {
    flex: 1,
  },
  statusLabel: {
    ...typography.caption,
    color: colors.muted,
    marginBottom: spacing.xs,
  },
  statusValue: {
    ...typography.body,
    color: colors.safe,
  },
  healthSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    ...typography.subheading,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  heartbeatContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#1A202C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  heartbeat: {
    marginRight: spacing.lg,
  },
  heartbeatInfo: {
    flex: 1,
  },
  heartbeatLabel: {
    ...typography.body,
    color: colors.text,
    fontFamily: 'Manrope_600SemiBold',
  },
  heartbeatStatus: {
    ...typography.caption,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  historySection: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  viewAll: {
    ...typography.bodySmall,
    color: colors.primary,
    fontFamily: 'Manrope_600SemiBold',
  },
  historyList: {
    gap: spacing.md,
  },
  alertItem: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#1A202C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  alertIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  alertContent: {
    flex: 1,
    justifyContent: 'center',
  },
  alertMessage: {
    ...typography.body,
    color: colors.text,
  },
  alertTime: {
    ...typography.caption,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    height: 52,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#1A202C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  actionButtonText: {
    ...typography.body,
    color: colors.text,
    fontFamily: 'Manrope_600SemiBold',
  },
  emergencyButton: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  emergencyButtonText: {
    ...typography.body,
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
});
