'use strict';

/**
 * Libellés lisibles des évènements « Tenir à deux » (journal de partie, projection, console).
 * Garde-fous : le Souffle n'est jamais personnifié (un voile, des pages qui pâlissent), l'oiseau
 * n'est jamais nommé, l'erreur ne punit jamais. Les évènements privés (`private: true`) arrivent
 * ici déjà expurgés (`publicKeys`) : les corps ne lisent que les clés publiques.
 */

const PHASE_LABELS = {
  ouverture: 'ouverture',
  jeu: 'jeu',
  souffle: 'souffle',
  clos: 'tour clos',
};

const { numeroCase } = require('./shared/glCaseNumeroCore');

const RESSOURCE_LABELS = { power: 'gemmes', health: 'cœurs', gemmes: 'gemmes', coeurs: 'cœurs' };

/** Libellés des types d'effet de sort (`spell_effect.type`, cf. lib/glSpellEffects.js). */
const SPELL_EFFECT_LABELS = {
  move_delta: 'le pion se déplace d’une case',
  reroll: 'le dé est réarmé',
  mascotte_danse: 'une mascotte danse',
  heritage: 'un héritage est légué pour le chapitre suivant',
  reveler_zone: 'une page se révèle',
  apercu_cases: 'les six cases suivantes s’affichent',
  move_delta_cible: 'une autre équipe avance de trois cases',
  fouilles_bonus: 'chaque équipe gagne une fouille ce tour',
  ignorer_prochaine_case_souffle: 'la prochaine case Souffle n’aura pas d’effet',
  abri: 'une équipe est à l’abri ce tour',
  rejoindre_case_lanceur: 'l’équipe la plus en retard rejoint le lanceur',
  cordee: 'les deux équipes avanceront du meilleur de leurs jets',
  lumiere: 'la Lumière est demandée',
  reparer_zone: 'une page pâlie peut être réparée',
};

/** Tonalités de case (`marker_effect.tonalite`). */
const TONALITE_LABELS = {
  trame: 'une case Trame',
  souffle: 'une case Souffle',
  positif: 'une case favorable',
  negatif: 'une case difficile',
  neutre: 'une case',
};

function caseSuffix(payload) {
  const idx = num(payload.index ?? payload.pathIndex ?? payload.rang);
  const numero = numeroCase(idx);
  return numero != null ? ` jusqu’à la case ${numero}` : '';
}

/** Deltas d'une case ou d'un geste, sans jamais nommer un élève. */
function deltaText(payload) {
  const parts = [];
  const h = num(payload.healthDelta);
  const p = num(payload.powerDelta);
  const m = num(payload.moveDelta);
  if (h) parts.push(`${h > 0 ? '+' : ''}${h} ${plural(Math.abs(h), 'cœur', 'cœurs')}`);
  if (p) parts.push(`${p > 0 ? '+' : ''}${p} ${plural(Math.abs(p), 'gemme', 'gemmes')}`);
  if (m) parts.push(`${m > 0 ? '+' : ''}${m} ${plural(Math.abs(m), 'case', 'cases')}`);
  if (payload.passTurn === true) parts.push('tour passé');
  return parts.join(', ');
}

function str(value) {
  if (value == null) return '';
  const s = String(value).trim();
  return s;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function plural(n, singulier, pluriel) {
  return n > 1 ? pluriel : singulier;
}

function pageLabel(payload) {
  const titre = str(payload.titre);
  if (titre) return `« ${titre} »`;
  const code = str(payload.feuilletCode) || str(payload.zoneKey);
  return code ? `la page ${code}` : 'une page';
}

function teamName(teamId, resolveTeamLabel) {
  const label = resolveTeamLabel ? resolveTeamLabel(teamId) : null;
  return label ? `« ${label} »` : 'une équipe';
}

/**
 * @param {string} eventType
 * @param {object} payload
 * @param {{ teamLabel?: string|null, forPlayer?: boolean, resolveTeamLabel?: (id:number)=>string|null }} ctx
 * @returns {{ title: string, body: string }|null} null si l'évènement n'est pas un évènement tenir.
 */
function presentTenirJournalEvent(eventType, payload = {}, ctx = {}) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const equipe = ctx.teamLabel ? `L’équipe « ${ctx.teamLabel} »` : 'Une équipe';
  const resolveTeamLabel = ctx.resolveTeamLabel;
  const tour = num(p.roundNumber);
  const tourSuffix = tour ? ` (tour ${tour})` : '';

  switch (eventType) {
    case 'tour_ouvert':
      return {
        title: 'Tour ouvert',
        body: `Le tour ${tour || ''} commence : les équipes se préparent.`.replace('  ', ' '),
      };
    case 'tour_phase': {
      const phase = PHASE_LABELS[str(p.phase)] || str(p.phase) || 'suivante';
      const passeur = p.passeur && typeof p.passeur === 'object' ? str(p.passeur.titre) : '';
      const extra =
        str(p.phase) === 'souffle'
          ? ' Le voile peut avancer.'
          : passeur
            ? ` Page du passeur : « ${passeur} ».`
            : '';
      return { title: 'Phase du tour', body: `Le tour passe en phase « ${phase} ».${extra}` };
    }
    case 'round_start':
      return { title: 'Nouveau tour', body: `Le tour ${tour || ''} s’ouvre.`.replace('  ', ' ') };
    case 'tour_clos':
      return { title: 'Tour clos', body: `Le tour ${tour || ''} est clos.`.replace('  ', ' ') };
    case 'vent_caravane': {
      const cases = num(p.cases) || 0;
      return {
        title: 'Vent de la caravane',
        body: `${equipe} est portée par le vent : ${cases} ${plural(cases, 'case', 'cases')} en avant${tourSuffix}.`,
      };
    }
    case 'cartes_vers_cases': {
      const cartes = num(p.cartes) || 0;
      const cases = num(p.cases) || 0;
      return {
        title: 'Cartes vers cases',
        body: `${equipe} convertit ${cartes} ${plural(cartes, 'carte', 'cartes')} en ${cases} ${plural(cases, 'case', 'cases')}.`,
      };
    }
    case 'dice_roll': {
      const total = num(p.total) ?? num(p.cases);
      const faces = Array.isArray(p.faces) ? p.faces : Array.isArray(p.values) ? p.values : null;
      const facesText = faces && faces.length ? ` (${faces.join(' + ')})` : '';
      const beneficiaire = num(p.beneficiaryTeamId);
      const motif = str(p.motif);
      const cible =
        beneficiaire && resolveTeamLabel && resolveTeamLabel(beneficiaire) !== ctx.teamLabel
          ? ` Le jet profite à l’équipe ${teamName(beneficiaire, resolveTeamLabel)}.`
          : '';
      return {
        title: 'Jet de dés',
        body: `${equipe} avance de ${total ?? '?'} ${plural(total || 0, 'case', 'cases')}${facesText}.${cible}${motif ? ` Motif : ${motif}.` : ''}`,
      };
    }
    case 'avance_libre': {
      const cases = num(p.cases) || 0;
      const motif = str(p.motif);
      return {
        title: p.caravane ? 'La caravane repart' : 'Avance libre',
        body: `${equipe} avance de ${cases} ${plural(cases, 'case', 'cases')}${motif ? ` — ${motif}` : ''}.`,
      };
    }
    case 'des_saisie_attente': {
      const faces = Array.isArray(p.faces) ? p.faces.join(' + ') : '';
      return {
        title: 'Dés à valider',
        body: `${equipe} annonce ses dés${faces ? ` (${faces})` : ''} : en attente de validation.`,
      };
    }
    case 'des_saisie_refusee':
      return { title: 'Dés à relancer', body: `${equipe} relance ses dés : pas encore validés.` };
    case 'peripetie': {
      const titre = str(p.titre) || str(p.nom);
      return {
        title: 'Péripétie',
        body: `${equipe} vit une péripétie${titre ? ` : « ${titre} »` : ''}.`,
      };
    }
    case 'peripetie_passee':
      return { title: 'Péripétie passée', body: 'La péripétie est passée, le tour continue.' };
    case 'arrivee_camp':
      return {
        title: p.premiere ? 'Première arrivée au camp' : 'Arrivée au camp',
        body: p.premiere
          ? `${equipe} arrive la première au camp : ses prochains jets profitent à l’équipe la plus en retard.`
          : `${equipe} rejoint le camp.`,
      };
    case 'relance_bonus':
      return p.relance === false
        ? {
            title: 'Bonne réponse',
            body: `${equipe} a bien répondu : +1 case (la relance du tour est déjà prise)${tourSuffix}.`,
          }
        : {
            title: 'Relance',
            body: `${equipe} a bien répondu : +1 case et une relance${tourSuffix}.`,
          };
    case 'fouille': {
      const verdict = str(p.verdict);
      const verdictLabel =
        { froid: 'froid', tiede: 'tiède', chaud: 'chaud', zone: 'une page dort ici' }[verdict] ||
        verdict;
      return {
        title: p.flair ? 'Flair' : 'Fouille',
        body: `${equipe} fouille la carte${verdictLabel ? ` : ${verdictLabel}` : ''}.`,
      };
    }
    case 'fouille_fenetre':
      return {
        title: 'Fenêtre de fouille',
        body: p.ouverte
          ? 'Le prof ouvre une fenêtre de fouille.'
          : 'La fenêtre de fouille se referme.',
      };
    case 'pas_encore': {
      const kind = str(p.kind);
      const quoi =
        kind === 'case'
          ? 'la question de la case'
          : kind === 'lecture'
            ? 'la question de lecture'
            : 'la question de la zone';
      return {
        title: 'Pas encore',
        body: `${equipe} n’a pas encore la bonne réponse à ${quoi} : rien ne se retire, la page attend encore.`,
      };
    }
    case 'page_revelee':
      return {
        title: 'Page révélée',
        body: `Une page se révèle ${str(p.via) === 'lanterne' ? 'à la lumière de la Lanterne' : 'sous les feuilles'} : ${pageLabel(p)}. Pas encore trouvée.`,
      };
    case 'page_trouvee':
      return { title: 'Page trouvée', body: `${equipe} trouve ${pageLabel(p)}.` };
    case 'page_reparee':
      return {
        title: 'Page réparée',
        body: `${equipe} répare ${pageLabel(p)}${str(p.via) === 'nommer' ? ' en la nommant' : ''}.`,
      };
    case 'page_lue':
      return {
        title: 'Page lue',
        body: `${equipe} lit ${pageLabel(p)}${str(p.via) === 'veillee' ? ' en veillée' : ''}.`,
      };
    case 'page_tenue': {
      const decouvreuse = num(p.decouvreuseTeamId);
      const tenante = num(p.tenanteTeamId);
      const d = decouvreuse ? teamName(decouvreuse, resolveTeamLabel) : 'une équipe';
      const t = tenante ? teamName(tenante, resolveTeamLabel) : 'l’autre peuple';
      return {
        title: 'Page tenue à deux',
        body: `${pageLabel(p)} est tenue à deux : trouvée par ${d}, lue par ${t}. Chaque peuple reçoit sa ressource.`,
      };
    }
    case 'carnet_complet': {
      const recul = num(p.recul) || 0;
      return {
        title: 'Carnet complet',
        body: `Toutes les pages du plateau sont tenues${recul ? ` : le voile recule de ${recul} ${plural(recul, 'case', 'cases')}` : ''}.`,
      };
    }
    case 'piste':
      return { title: 'Piste de veillée', body: `Une piste s’ouvre vers ${pageLabel(p)}.` };
    case 'voile_avance': {
      // `from` / `to` sont des RANGS (0-based) : affichés en numéro humain (rang + 1), comme
      // le bandeau de l'écran du tour (lib/shared/glCaseNumeroCore.js).
      const from = numeroCase(num(p.from));
      const to = numeroCase(num(p.to));
      const palies = Array.isArray(p.pagesPalies) ? p.pagesPalies.length : num(p.pagesPalies) || 0;
      const sous = Array.isArray(p.teamsUnderVoile) ? p.teamsUnderVoile.length : 0;
      const parts = [];
      const depuis = from != null ? ` de la case ${from}` : '';
      if (to != null) parts.push(`Le voile avance${depuis} jusqu’à la case ${to}`);
      else parts.push('Le voile avance');
      if (sous) parts.push(`${sous} ${plural(sous, 'équipe', 'équipes')} sous le voile`);
      if (palies) parts.push(`${palies} ${plural(palies, 'page pâlit', 'pages pâlissent')}`);
      return { title: 'Le voile avance', body: `${parts.join(' ; ')}.` };
    }
    case 'voile_dort':
      return { title: 'Le voile dort', body: 'Le voile ne bouge pas ce tour.' };
    case 'voile_recul': {
      const cases = num(p.cases) || 0;
      const reason = str(p.reason);
      const motif =
        {
          lumiere: 'grâce à la Lumière',
          carnet_complet: 'le carnet est complet',
          sort: 'par un sort',
        }[reason] || '';
      return {
        title: 'Le voile recule',
        body: `Le voile recule de ${cases} ${plural(cases, 'case', 'cases')}${motif ? ` ${motif}` : ''}.`,
      };
    }
    case 'chapardeur':
      return {
        title: 'Chapardeur',
        body: p.ressource
          ? `Une bourse a été visitée : ${RESSOURCE_LABELS[str(p.ressource)] || 'une ressource'} en moins${tourSuffix}.`
          : `Le chapardeur est passé dans la caravane${tourSuffix}.`,
      };
    case 'nid_rendu':
      return { title: 'Nid rendu', body: `Le nid rend son butin à ${equipe.toLowerCase()}.` };
    case 'retrait':
      return {
        title: 'Retrait',
        body:
          str(p.entree) === 'false' || p.entree === false
            ? 'Une personne revient dans la partie.'
            : 'Une personne se met en retrait.',
      };
    case 'absences': {
      const count = num(p.count) || 0;
      return {
        title: 'Absences',
        body: count
          ? `${count} ${plural(count, 'absence enregistrée', 'absences enregistrées')}${tourSuffix}.`
          : `Aucune absence${tourSuffix}.`,
      };
    }
    case 'team_spirit':
      return { title: 'Team Spirit', body: `Les équipes font leur bilan${tourSuffix}.` };
    case 'lumiere_palier': {
      const palier = num(p.palier);
      return {
        title: 'Lumière',
        body: `La classe atteint un palier de Lumière${palier ? ` (${palier})` : ''}.`,
      };
    }
    case 'lumiere_choix': {
      const libelle = str(p.libelle) || str(p.choix);
      return {
        title: 'Choix de Lumière',
        body: `La classe choisit${libelle ? ` : « ${libelle} »` : ''}.`,
      };
    }
    case 'olu_erreur':
      return {
        title: 'Olu se trompe',
        body: str(p.texte) ? `Olu : « ${str(p.texte)} »` : 'Olu dit quelque chose d’étonnant…',
      };
    case 'olu_corrige': {
      const automatique = p.teamId == null && !ctx.teamLabel;
      if (automatique) {
        return {
          title: 'Olu se reprend',
          body: `Olu se reprend${str(p.correction) ? ` : « ${str(p.correction)} »` : ''}.`,
        };
      }
      return {
        title: 'Olu corrigé',
        body: `${ctx.teamLabel ? equipe : 'Une équipe'} corrige Olu${str(p.correction) ? ` : « ${str(p.correction)} »` : ''}.`,
      };
    }
    case 'spell_effect': {
      const nom = str(p.spellName) || str(p.spellCode) || 'un sort';
      const effet = SPELL_EFFECT_LABELS[str(p.type)] || '';
      const delta = num(p.delta);
      const precision =
        str(p.type) === 'move_delta' && delta
          ? ` : ${delta > 0 ? '+' : ''}${delta} case`
          : effet
            ? ` : ${effet}`
            : '';
      return {
        title: 'Effet de sort',
        body: `L’effet de « ${nom} » s’applique${precision}${p.aide ? ' (aide)' : ''}.`,
      };
    }
    case 'spell_cast': {
      const nom = str(p.spellName) || str(p.spellCode) || 'un sort';
      return { title: 'Sort lancé', body: `${equipe} lance « ${nom} ».` };
    }
    case 'spell_cast_request': {
      const nom = str(p.spellName) || str(p.spellCode) || 'un sort';
      return {
        title: 'Sort proposé',
        body: `${equipe} propose « ${nom} » : le prof décide.`,
      };
    }
    case 'move': {
      const label = str(p.markerLabel);
      const ou = label ? ` sur « ${label} »` : caseSuffix(p);
      if (p.bonus === true)
        return { title: 'Case bonus', body: `${equipe} avance d’une case${ou}.` };
      if (p.cordee === true) {
        return { title: 'Cordée', body: `${equipe} rattrape sa cordée${ou}.` };
      }
      if (str(p.spell)) {
        return { title: 'Déplacement de sort', body: `${equipe} est déplacée${ou} par un sort.` };
      }
      if (p.fromDice === true) {
        return { title: 'Déplacement', body: `${equipe} avance${ou}.` };
      }
      return { title: 'Déplacement', body: `${equipe} se déplace${ou}.` };
    }
    case 'marker_effect': {
      const label = str(p.markerLabel) || str(p.reason);
      const tonalite = TONALITE_LABELS[str(p.tonalite)] || 'une case';
      const delta = deltaText(p);
      const sentier = p.sentier === true ? ' Le Sentier en annule l’effet.' : '';
      return {
        title: 'Effet de case',
        body: `${equipe} arrive sur ${tonalite}${label ? ` « ${label} »` : ''}${delta ? ` : ${delta}` : ''}.${sentier}`,
      };
    }
    case 'marker_arrival': {
      const label = str(p.markerLabel);
      return { title: 'Arrivée', body: `${equipe} arrive${label ? ` sur « ${label} »` : ''}.` };
    }
    case 'marker_question_presented': {
      const label = str(p.markerLabel);
      return {
        title: 'Question de case',
        body: `${equipe} tire une question${label ? ` sur « ${label} »` : ''}.`,
      };
    }
    case 'qcm_answer':
      return p.correct === true
        ? { title: 'Bonne réponse', body: `${equipe} répond juste.` }
        : { title: 'Pas encore', body: `${equipe} n’a pas encore trouvé : la case révèle.` };
    case 'score':
      return { title: 'Point', body: `${equipe} marque un point.` };
    case 'turn_change':
      return { title: 'Équipe suivante', body: `C’est au tour de ${equipe.toLowerCase()}.` };
    case 'parure':
      return {
        title: 'Parure',
        body: `${equipe} porte une nouvelle parure${str(p.nom) ? ` : « ${str(p.nom)} »` : ''}.`,
      };
    case 'don':
      return {
        title: 'Don',
        body: p.feuilletCode
          ? 'Une page est offerte sur le Marché.'
          : `Un don est fait sur le Marché${num(p.gemmes) ? ` (${num(p.gemmes)} ${plural(num(p.gemmes), 'gemme', 'gemmes')})` : num(p.coeurs) ? ` (${num(p.coeurs)} ${plural(num(p.coeurs), 'cœur', 'cœurs')})` : ''}.`,
      };
    case 'annonce':
      return {
        title: 'Annonce',
        body: `Une annonce « ${str(p.type) || 'cherche'} » est publiée sur le Marché.`,
      };
    case 'vitality_change':
      return { title: 'Bourse ajustée', body: 'Le prof ajuste une bourse (geste exceptionnel).' };
    case 'action_request':
      return { title: 'Demande', body: `${equipe} fait une demande au prof.` };
    case 'action_resolved':
      return { title: 'Demande traitée', body: 'Le prof a répondu à une demande.' };
    case 'game_status':
      return {
        title: 'Partie',
        body: `La partie change d’état${str(p.status) ? ` : ${str(p.status)}` : ''}.`,
      };
    case 'narration':
      return { title: 'Annonce du prof', body: str(p.text) || 'Le prof partage une annonce.' };
    case 'teams_composed':
      return { title: 'Équipes', body: 'Les équipes du chapitre sont composées.' };
    case 'feuillet_discovered':
    case 'feuillet_read':
    case 'feuillet_held':
    case 'feuillet_effaced':
      return {
        title: 'Carnet',
        body: `${equipe} fait vivre son carnet${pageLabel(p) !== 'une page' ? ` : ${pageLabel(p)}` : ''}.`,
      };
    case 'spell_effect_applied': {
      const nom = str(p.spellName) || 'un sort';
      return { title: 'Effet appliqué', body: `Le prof applique l’effet de « ${nom} ».` };
    }
    case 'spell_file': {
      const nom = str(p.spellName) || str(p.spellCode) || 'un sort';
      const effet = str(p.effetCourt);
      return {
        title: 'Sort dans la file du prof',
        body: `« ${nom} » attend le geste du prof${effet ? ` : ${effet}` : ''}.`,
      };
    }
    case 'heritage_recu':
      return { title: 'Héritage', body: 'Un Héritage de la classe est versé.' };
    case 'honneur': {
      const titre = str(p.titre) || str(p.honneur);
      return {
        title: p.double ? 'Honneur — Très Grands' : 'Honneur',
        body: `${equipe} reçoit l’honneur${titre ? ` « ${titre} »` : ''}.`,
      };
    }
    case 'mission_reussie':
      return {
        title: 'Mission réussie',
        body: `${equipe} accomplit sa mission${str(p.titre) ? ` : sceau « ${str(p.titre)} »` : ''}.`,
      };
    case 'badge':
      return {
        title: 'Badge',
        body: `Un badge est remis${str(p.nom) ? ` : « ${str(p.nom)} »` : ''}.`,
      };
    case 'chimere_validee':
      return {
        title: 'Chimère',
        body: `Une chimère entre au Bestiaire${str(p.nom) ? ` : « ${str(p.nom)} »` : ''}.`,
      };
    case 'plume_validee':
      return {
        title: 'Plume',
        body: `Une page écrite par un voyageur rejoint le carnet${str(p.titre) ? ` : « ${str(p.titre)} »` : ''}.`,
      };
    case 'seuil_clos':
      return {
        title: 'Seuil clos',
        body: 'La caravane s’arrête : le chapitre est clos, les honneurs sont remis.',
      };
    case 'tenir_profil':
      return {
        title: 'Profil de partie',
        body: `Profil « ${str(p.profil) || '?'} », surface « ${str(p.surface) || '?'} ».`,
      };
    case 'projection':
      return { title: 'Projection', body: 'Un lien de projection est créé.' };
    default:
      return null;
  }
}

const TENIR_EVENT_TYPES = [
  'round_start',
  'tour_ouvert',
  'tour_phase',
  'tour_clos',
  'vent_caravane',
  'cartes_vers_cases',
  'dice_roll',
  'avance_libre',
  'des_saisie_attente',
  'des_saisie_refusee',
  'peripetie',
  'peripetie_passee',
  'arrivee_camp',
  'relance_bonus',
  'fouille',
  'fouille_fenetre',
  'pas_encore',
  'page_revelee',
  'page_trouvee',
  'page_reparee',
  'page_lue',
  'page_tenue',
  'carnet_complet',
  'piste',
  'voile_avance',
  'voile_dort',
  'voile_recul',
  'chapardeur',
  'nid_rendu',
  'retrait',
  'absences',
  'team_spirit',
  'lumiere_palier',
  'lumiere_choix',
  'olu_erreur',
  'olu_corrige',
  'spell_effect',
  'spell_file',
  'heritage_recu',
  'honneur',
  'mission_reussie',
  'badge',
  'chimere_validee',
  'plume_validee',
  'seuil_clos',
  'tenir_profil',
  'projection',
  // Types partagés avec le jeu classique, relibellés en partie tenir.
  'move',
  'spell_cast',
  'spell_cast_request',
  'spell_effect_applied',
  'marker_effect',
  'marker_arrival',
  'marker_question_presented',
  'qcm_answer',
  'score',
  'turn_change',
  'parure',
  'don',
  'annonce',
  'vitality_change',
  'action_request',
  'action_resolved',
  'game_status',
  'narration',
  'teams_composed',
  'feuillet_discovered',
  'feuillet_read',
  'feuillet_held',
  'feuillet_effaced',
];

module.exports = { presentTenirJournalEvent, TENIR_EVENT_TYPES };
