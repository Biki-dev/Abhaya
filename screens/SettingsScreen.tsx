// Full offline-first emergency contacts management.
// • Reads from local AsyncStorage (instant, always works offline)
// • Writes locally first → background sync to backend
// • Shows sync state & allows re-sync
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Switch,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius, sizes } from '../theme';
import {
  getContacts,
  addContact,
  updateContact,
  deleteContact,
  initContactsFromBackend,
  type EmergencyContact,
} from '../services/emergencyContacts';
import { useAuth } from '../navigation/RootNavigator';

type ContactEditState = {
  localId: string | null;   // null = new contact
  name:    string;
  phone:   string;
};

export default function SettingsScreen({ navigation }: any) {
  const { signOut } = useAuth();
  // ── local contacts state ───────────────────────────────────────────────────
  const [contacts, setContactsState] = useState<EmergencyContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // ── edit modal state ───────────────────────────────────────────────────────
  const [editMode, setEditMode]       = useState(false);
  const [editState, setEditState]     = useState<ContactEditState>({ localId: null, name: '', phone: '' });
  const [editErrors, setEditErrors]   = useState<{ name?: string; phone?: string }>({});

  // ── safety toggles ────────────────────────────────────────────────────────
  const [settings, setSettings] = useState({
    audioRecording: true,
    gpsTracking:    true,
    emergencyAlerts: true,
    wakeWord:       false,
  });

  // ── load contacts on mount ─────────────────────────────────────────────────
  const loadContacts = useCallback(async (fromBackend = false) => {
    if (fromBackend) setSyncing(true);
    try {
      const list = fromBackend
        ? await initContactsFromBackend()
        : await getContacts();
      setContactsState(list);
    } finally {
      setContactsLoading(false);
      if (fromBackend) setSyncing(false);
    }
  }, []);

  useEffect(() => {
    loadContacts(false);
    // Try backend sync in background without blocking UI
    loadContacts(true);
  }, []);

  // ── contact CRUD ───────────────────────────────────────────────────────────
  const openAddForm = () => {
    setEditState({ localId: null, name: '', phone: '' });
    setEditErrors({});
    setEditMode(true);
  };

  const openEditForm = (contact: EmergencyContact) => {
    setEditState({ localId: contact.localId, name: contact.name, phone: contact.phone });
    setEditErrors({});
    setEditMode(true);
  };

  const validateForm = (): boolean => {
    const errors: { name?: string; phone?: string } = {};
    if (!editState.name.trim()) errors.name = 'Name is required';
    if (!editState.phone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (editState.phone.replace(/\D/g, '').length < 7) {
      errors.phone = 'Enter a valid phone number';
    }
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveContact = async () => {
    if (!validateForm()) return;

    try {
      if (editState.localId === null) {
        // New contact
        const created = await addContact(editState.name, editState.phone);
        setContactsState((prev) => [...prev, created]);
      } else {
        // Update existing
        const updated = await updateContact(editState.localId, editState.name, editState.phone);
        if (updated) {
          setContactsState((prev) =>
            prev.map((c) => (c.localId === updated.localId ? updated : c))
          );
        }
      }
      setEditMode(false);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save contact');
    }
  };

  const handleDeleteContact = (contact: EmergencyContact) => {
    Alert.alert(
      'Remove Contact',
      `Remove ${contact.name} from emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:    'Remove',
          style:   'destructive',
          onPress: async () => {
            await deleteContact(contact.localId);
            setContactsState((prev) => prev.filter((c) => c.localId !== contact.localId));
          },
        },
      ]
    );
  };

  const handleManualSync = () => {
    loadContacts(true);
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of Saathi?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Log Out', 
          style: 'destructive',
          onPress: async () => {
            await signOut();
          }
        },
      ]
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
          <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
          <Text style={styles.backButton}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.placeholder} />
      </View>
      {/* ── Emergency Contacts ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Emergency Contacts</Text>
            <Text style={styles.sectionSubtitle}>
              SOS alerts are sent to all contacts below
            </Text>
          </View>
          <View style={styles.sectionActions}>
            <TouchableOpacity
              onPress={handleManualSync}
              style={styles.syncBtn}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator size={14} color={colors.primary} />
              ) : (
                <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={openAddForm} style={styles.addBtn}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Edit / Add Form (inline) ── */}
        {editMode && (
          <View style={styles.editForm}>
            <Text style={styles.editFormTitle}>
              {editState.localId ? 'Edit Contact' : 'Add New Contact'}
            </Text>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={[styles.fieldInput, editErrors.name ? styles.fieldInputError : null]}
                placeholder="e.g. Mom"
                placeholderTextColor={colors.muted}
                value={editState.name}
                onChangeText={(v) => setEditState((s) => ({ ...s, name: v }))}
                autoFocus
              />
              {editErrors.name && (
                <Text style={styles.fieldError}>{editErrors.name}</Text>
              )}
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Phone Number</Text>
              <TextInput
                style={[styles.fieldInput, editErrors.phone ? styles.fieldInputError : null]}
                placeholder="+91XXXXXXXXXX"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                value={editState.phone}
                onChangeText={(v) => setEditState((s) => ({ ...s, phone: v }))}
              />
              {editErrors.phone && (
                <Text style={styles.fieldError}>{editErrors.phone}</Text>
              )}
            </View>

            <View style={styles.editFormBtns}>
              <TouchableOpacity
                style={styles.cancelFormBtn}
                onPress={() => setEditMode(false)}
              >
                <Text style={styles.cancelFormText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveFormBtn}
                onPress={handleSaveContact}
              >
                <Text style={styles.saveFormText}>
                  {editState.localId ? 'Update' : 'Add Contact'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Contacts List ── */}
        {contactsLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Loading contacts…</Text>
          </View>
        ) : contacts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="people-outline" size={40} color={colors.muted} />
            <Text style={styles.emptyTitle}>No emergency contacts</Text>
            <Text style={styles.emptySubtitle}>
              Add contacts so they receive an SMS when you trigger SOS
            </Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={openAddForm}>
              <Text style={styles.emptyAddText}>+ Add First Contact</Text>
            </TouchableOpacity>
          </View>
        ) : (
          contacts.map((contact) => (
            <View key={contact.localId} style={styles.contactItem}>
              {/* Avatar */}
              <View style={styles.contactAvatar}>
                <Text style={styles.contactInitial}>
                  {contact.name.charAt(0).toUpperCase()}
                </Text>
              </View>

              {/* Info */}
              <View style={styles.contactInfo}>
                <View style={styles.contactNameRow}>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  {contact.backendId != null && (
                    <Ionicons
                      name="cloud-done-outline"
                      size={12}
                      color={colors.safe}
                      style={{ marginLeft: 4 }}
                    />
                  )}
                </View>
                <Text style={styles.contactPhone}>{contact.phone}</Text>
              </View>

              {/* Actions */}
              <TouchableOpacity
                style={styles.contactActionBtn}
                onPress={() => openEditForm(contact)}
              >
                <Ionicons name="pencil-outline" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.contactActionBtn, styles.contactDeleteBtn]}
                onPress={() => handleDeleteContact(contact)}
              >
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Sync hint */}
        {!contactsLoading && (
          <Text style={styles.syncHint}>
            {syncing
              ? 'Syncing with server…'
              : '☁️  Changes sync automatically when online'}
          </Text>
        )}
      </View>

      {/* ── Account ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>

        {[
          { icon: 'person-circle-outline',      label: 'View Full Profile' },
          { icon: 'shield-checkmark-outline',   label: 'Privacy & Security' },
          { icon: 'information-circle-outline', label: 'About Saathi' },
          { icon: 'call-outline',               label: 'Contact Support' },
        ].map(({ icon, label }) => (
          <TouchableOpacity key={label} style={styles.menuItem}>
            <View style={styles.menuIcon}>
              <Ionicons name={icon as any} size={20} color={colors.text} />
            </View>
            <Text style={styles.menuText}>{label}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Danger Zone ── */}
      <View style={styles.section}>
        
        <TouchableOpacity style={styles.dangerButton} onPress={handleLogout}>
          <Text style={styles.dangerButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.versionText}>Saathi v1.0.0</Text>
        <Text style={styles.copyrightText}>Made for your safety</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // ── header ──
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    shadowColor: '#1A202C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  backRow:     { flexDirection: 'row', alignItems: 'center' },
  backButton:  { color: colors.textSecondary, fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  headerTitle: { ...typography.heading, color: colors.text },
  placeholder: { width: 50 },

  // ── section ──
  section: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sectionHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  sectionTitle:    { ...typography.subheading, color: colors.text },
  sectionSubtitle: { ...typography.caption, color: colors.muted, marginTop: 2, maxWidth: 200 },
  sectionActions:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  syncBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center',
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  addBtnText: { fontSize: 13, color: '#fff', fontFamily: 'Manrope_700Bold' },

  // ── edit form ──
  editForm: {
    backgroundColor: colors.bg, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.primary + '40',
    padding: spacing.lg, marginBottom: spacing.lg,
  },
  editFormTitle: {
    ...typography.subheading, color: colors.primary, marginBottom: spacing.lg,
  },
  fieldWrap:        { marginBottom: spacing.md },
  fieldLabel:       { ...typography.caption, color: colors.muted, marginBottom: 4, fontFamily: 'Manrope_600SemiBold' },
  fieldInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    color: colors.text, fontSize: 14, fontFamily: 'Manrope_500Medium',
  },
  fieldInputError:  { borderColor: colors.danger },
  fieldError:       { ...typography.caption, color: colors.danger, marginTop: 3 },
  editFormBtns:     { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  cancelFormBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  cancelFormText:   { ...typography.body, color: colors.muted },
  saveFormBtn: {
    flex: 2, paddingVertical: spacing.md, borderRadius: borderRadius.md,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  saveFormText:     { ...typography.body, color: '#fff', fontFamily: 'Manrope_700Bold' },

  // ── loading / empty ──
  loadingBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.xl, justifyContent: 'center',
  },
  loadingText: { ...typography.body, color: colors.muted },
  emptyBox: {
    alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm,
  },
  emptyTitle:    { ...typography.subheading, color: colors.text },
  emptySubtitle: { ...typography.body, color: colors.muted, textAlign: 'center', maxWidth: 260 },
  emptyAddBtn: {
    marginTop: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
  },
  emptyAddText:  { color: '#fff', fontFamily: 'Manrope_700Bold' },

  // ── contact row ──
  contactItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#1A202C', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  contactAvatar: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary + '20',
    justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
  },
  contactInitial: { fontSize: 16, color: colors.primary, fontFamily: 'Manrope_700Bold' },
  contactInfo:    { flex: 1 },
  contactNameRow: { flexDirection: 'row', alignItems: 'center' },
  contactName:    { ...typography.body, color: colors.text, fontFamily: 'Manrope_600SemiBold' },
  contactPhone:   { ...typography.caption, color: colors.muted, marginTop: 2 },
  contactActionBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center',
    marginLeft: spacing.sm,
  },
  contactDeleteBtn: { borderColor: colors.danger + '40', backgroundColor: colors.danger + '08' },

  syncHint: { ...typography.caption, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },

  // ── safety toggles ──
  settingItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.lg, paddingBottom: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  settingInfo:        { flex: 1 },
  settingLabel:       { ...typography.body, color: colors.text, fontFamily: 'Manrope_600SemiBold', marginBottom: spacing.xs },
  settingDescription: { ...typography.caption, color: colors.muted },

  // ── safe zones / account ──
  addButtonText: { ...typography.bodySmall, color: colors.primary, fontFamily: 'Manrope_600SemiBold' },
  emptyState:    { paddingVertical: spacing.xxl, alignItems: 'center' },
  emptyStateText:    { ...typography.body, color: colors.text, fontFamily: 'Manrope_600SemiBold', marginBottom: spacing.xs },
  emptyStateSubtext: { ...typography.caption, color: colors.muted, textAlign: 'center' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuIcon: { width: 40, height: 40, borderRadius: borderRadius.md, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', marginRight: spacing.lg },
  menuText: { flex: 1, ...typography.body, color: colors.text, fontFamily: 'Manrope_500Medium' },

  // ── danger ──
  dangerTitle:               { color: colors.danger },
  dangerButton:              { paddingVertical: spacing.lg, borderRadius: borderRadius.md, backgroundColor: colors.surface, alignItems: 'center', marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  dangerButtonText:          { ...typography.body, color: colors.text, fontWeight: '600' },
  dangerButtonDestructive:   { paddingVertical: spacing.lg, borderRadius: borderRadius.md, backgroundColor: 'rgba(239, 68, 68, 0.08)', alignItems: 'center', borderWidth: 1, borderColor: colors.danger },
  dangerButtonDestructiveText: { ...typography.body, color: colors.danger, fontWeight: '600' },

  footer: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.lg },
  versionText:   { ...typography.caption, color: colors.muted, marginBottom: spacing.xs },
  copyrightText: { ...typography.caption, color: colors.muted },
});