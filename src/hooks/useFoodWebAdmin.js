import { useCallback, useState } from 'react';
import { api } from '../services/api';
import {
  EMPTY_INTERACTION_FORM,
  editFormFromRow,
  interactionPayload,
} from '../components/pedago/foodWebRows.js';

/**
 * Gestion des interactions par un professeur (sorti de `FoodWebView.jsx`, flux C3) :
 * formulaire d'ajout, modification d'une relation existante (PUT — sinon corriger imposait de
 * supprimer puis recréer), suppression. Chaque écriture recharge le réseau (`reload`).
 *
 * @param {{ reload: () => Promise<void>, onDeleted?: (id: number) => void }} options
 */
export function useFoodWebAdmin({ reload, onDeleted }) {
  const [form, setForm] = useState(EMPTY_INTERACTION_FORM);
  const [saving, setSaving] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');

  const createInteraction = useCallback(
    async (event) => {
      event.preventDefault();
      setAdminError('');
      const fromId = Number(form.fromId);
      if (!Number.isInteger(fromId) || fromId <= 0) {
        setAdminError('Choisis une espèce source.');
        return;
      }
      setSaving(true);
      try {
        await api('/api/food-web/interactions', 'POST', {
          from_id: fromId,
          ...interactionPayload(form),
        });
        setForm((prev) => ({ ...EMPTY_INTERACTION_FORM, type: prev.type }));
        await reload();
      } catch (err) {
        setAdminError(err.message || 'Création impossible');
      } finally {
        setSaving(false);
      }
    },
    [form, reload],
  );

  const saveInteraction = useCallback(
    async (event) => {
      event.preventDefault();
      if (!editForm) return;
      setEditError('');
      setSaving(true);
      try {
        await api(`/api/food-web/interactions/${editForm.id}`, 'PUT', {
          from_id: Number(editForm.fromId),
          ...interactionPayload(editForm),
        });
        setEditForm(null);
        await reload();
      } catch (err) {
        setEditError(err.message || 'Modification impossible');
      } finally {
        setSaving(false);
      }
    },
    [editForm, reload],
  );

  const deleteInteraction = useCallback(
    async (interactionId) => {
      if (!interactionId) return;
      setAdminError('');
      try {
        await api(`/api/food-web/interactions/${interactionId}`, 'DELETE');
        onDeleted?.(interactionId);
        await reload();
      } catch (err) {
        setAdminError(err.message || 'Suppression impossible');
      }
    },
    [reload, onDeleted],
  );

  const startEdit = useCallback((row) => {
    setEditError('');
    setEditForm(editFormFromRow(row));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditForm(null);
    setEditError('');
  }, []);

  return {
    form,
    setForm,
    saving,
    adminError,
    editForm,
    setEditForm,
    editError,
    createInteraction,
    saveInteraction,
    deleteInteraction,
    startEdit,
    cancelEdit,
  };
}
