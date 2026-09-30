const express = require('express');
const { queryOne } = require('../../database');
const { getAbsolutePath } = require('../../lib/uploads');
const { sendFilePublicImageOptions } = require('../../lib/httpImageCache');
const {
  isPrivateUploadPath,
  normalizeUploadPathSegments,
} = require('../../lib/uploadsPrivatePaths');
const asyncHandler = require('../../lib/asyncHandler');
const logger = require('../../lib/logger');

const router = express.Router();

/**
 * Image illustrative d'une tâche — **repli** documenté (`docs/API.md`), sans authentification,
 * au même niveau d'accès que la tâche elle-même (`GET /api/tasks/:id` est lisible sans compte).
 *
 * En temps normal `image_url` pointe vers `/uploads/tasks/<id>.<ext>?exp=…&sig=…` (famille
 * `tasks/` lisible par URL signée depuis le constat RG4) : le chemin est écrit
 * par l'API sous cette forme exacte (`routes/tasks.js`), donc ce repli ne sert que des lignes
 * héritées au chemin disque atypique. La frontière entre familles publiques et privées
 * d'`uploads/` est tenue par `lib/uploadsPrivatePaths.js` (audit B2,
 * `docs/AUDIT_BUGS_2026-07.md`, puis constat RG4 de `docs/AUDIT_SECURITE_RGPD_2026-09-30.md`).
 *
 * Ce qui manquait, en revanche, c'est que ce repli **respecte cette frontière**. Le montage
 * statique `/uploads` la fait respecter par `createPrivateUploadsGuard`, dont la raison d'être
 * est que « l'autorisation portée par les routes API ne soit pas contournable ». Ici, la
 * dépendance jouait dans l'autre sens : `getAbsolutePath` vérifie seulement que le chemin reste
 * sous `uploads/`, pas qu'il appartient à une famille publique. Un `tasks.image_path` pointant
 * vers `observations/…`, `task-logs/…` ou un avatar d'élève aurait donc servi, sans authentification, un média que
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
    // La famille `tasks/` elle-même est privée en accès direct, mais c'est l'image de CETTE
    // tâche, demandée par son identifiant : la route porte le même droit que la tâche. Toute
    // autre famille privée (`observations/`, `task-logs/`, avatars…) reste refusée.
    const family = (normalizeUploadPathSegments(row.image_path) || [])[0];
    if (isPrivateUploadPath(row.image_path) && family !== 'tasks') {
      logger.warn(
        { taskId: req.params.id, requestId: req.requestId },
        'task_image_private_family_refused',
      );
      return res.status(404).json({ error: 'Aucune image' });
    }
    const absolutePath = getAbsolutePath(row.image_path);
    return res.sendFile(absolutePath, sendFilePublicImageOptions(), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
    });
  }),
);

module.exports = router;
