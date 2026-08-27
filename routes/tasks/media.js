const express = require('express');
const { queryOne } = require('../../database');
const { getAbsolutePath } = require('../../lib/uploads');
const { isPrivateUploadPath } = require('../../lib/uploadsPrivatePaths');
const asyncHandler = require('../../lib/asyncHandler');
const logger = require('../../lib/logger');

const router = express.Router();

/**
 * Image illustrative d'une tâche — **repli** documenté (`docs/API.md`), sans authentification
 * comme les autres médias publics (`zones/`, `markers/`, `forum-posts/`…).
 *
 * En temps normal `image_url` pointe vers `/uploads/tasks/<id>.<ext>` : le chemin est écrit
 * par l'API sous cette forme exacte (`routes/tasks.js`), donc ce repli ne sert que des lignes
 * héritées au chemin disque atypique. Le caractère public est **voulu** — la frontière entre
 * familles publiques et privées d'`uploads/` a été arbitrée à l'audit B2
 * (`docs/AUDIT_BUGS_2026-07.md`), qui n'a retenu comme privées que `observations/` et
 * `task-logs/`.
 *
 * Ce qui manquait, en revanche, c'est que ce repli **respecte cette frontière**. Le montage
 * statique `/uploads` la fait respecter par `createPrivateUploadsGuard`, dont la raison d'être
 * est que « l'autorisation portée par les routes API ne soit pas contournable ». Ici, la
 * dépendance jouait dans l'autre sens : `getAbsolutePath` vérifie seulement que le chemin reste
 * sous `uploads/`, pas qu'il appartient à une famille publique. Un `tasks.image_path` pointant
 * vers `observations/…` ou `task-logs/…` aurait donc servi, sans authentification, un média que
 * le montage statique refuse — la garde contournée par l'API au lieu de l'inverse.
 *
 * Aucun chemin d'écriture actuel ne produit une telle valeur : c'est une garde de profondeur,
 * qui ferme l'invariant plutôt que le seul cas connu.
 */
router.get(
  '/:id/image',
  asyncHandler(async (req, res) => {
    const row = await queryOne('SELECT image_path FROM tasks WHERE id = ?', [req.params.id]);
    if (!row?.image_path) return res.status(404).json({ error: 'Aucune image' });
    if (isPrivateUploadPath(row.image_path)) {
      logger.warn(
        { taskId: req.params.id, requestId: req.requestId },
        'task_image_private_family_refused',
      );
      return res.status(404).json({ error: 'Aucune image' });
    }
    const absolutePath = getAbsolutePath(row.image_path);
    return res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
    });
  }),
);

module.exports = router;
