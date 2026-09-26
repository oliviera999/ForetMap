'use strict';

/**
 * Filtre « Présence sur la carte » du catalogue, côté client.
 *
 * Depuis la décision Q10, le client ne refait plus la réunion registre / zones / repères :
 * il applique la réponse du serveur (`GET /api/maps/:mapId/species`), indexée par
 * `indexSpeciesPresence`. Les anciens noms mono-espèce (`current_plant`, `plant_name`) ne
 * comptent plus, et les lieux ne se reconnaissent qu'à leurs identifiants d'espèce.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

async function load(relPath) {
  return import(pathToFileURL(path.join(__dirname, '..', relPath)).href);
}

test('plantPresentOnActiveMap — réponse du serveur ; inconnue tant qu’elle n’est pas chargée', async () => {
  const { plantPresentOnActiveMap } = await load('src/utils/plantFilters.js');
  const { indexSpeciesPresence } = await load('src/utils/speciesPresence.js');
  const index = indexSpeciesPresence([
    { plant_id: 7, sources: ['registre'] },
    { plant_id: '8', sources: ['zone'] },
  ]);
  assert.equal(plantPresentOnActiveMap({ id: 7 }, index), true);
  assert.equal(plantPresentOnActiveMap({ id: 8 }, index), true);
  assert.equal(plantPresentOnActiveMap({ id: 9 }, index), false);
  // `map_ids` de la fiche n'est plus lu : seule la réponse du serveur fait foi.
  assert.equal(plantPresentOnActiveMap({ id: 9, map_ids: ['foret'] }, index), false);
  assert.equal(plantPresentOnActiveMap({ id: 7 }, null), null);
});

test('plantMatchesZonePresence — présente, absente, et rien de retiré tant que c’est inconnu', async () => {
  const { plantMatchesZonePresence, ZONE_PRESENCE_FILTER } = await load(
    'src/utils/plantFilters.js',
  );
  const { indexSpeciesPresence } = await load('src/utils/speciesPresence.js');
  const index = indexSpeciesPresence([{ plant_id: 7, sources: ['registre'] }]);
  const present = { id: 7 };
  const absent = { id: 8 };
  assert.equal(plantMatchesZonePresence(present, index, ZONE_PRESENCE_FILTER.IN_MAP), true);
  assert.equal(plantMatchesZonePresence(absent, index, ZONE_PRESENCE_FILTER.IN_MAP), false);
  assert.equal(plantMatchesZonePresence(present, index, ZONE_PRESENCE_FILTER.NOT_IN_MAP), false);
  assert.equal(plantMatchesZonePresence(absent, index, ZONE_PRESENCE_FILTER.NOT_IN_MAP), true);
  assert.equal(plantMatchesZonePresence(absent, index, ZONE_PRESENCE_FILTER.ALL), true);
  // Présence pas encore chargée (ou serveur injoignable) : aucun faux « aucun résultat ».
  assert.equal(plantMatchesZonePresence(absent, null, ZONE_PRESENCE_FILTER.IN_MAP), true);
});

test('lieux d’une fiche : identifiants d’espèce seulement, plus les anciens noms', async () => {
  const { plantLinkedToMapZone, plantLinkedToMapMarker, plantIdsMarkedOnMap } = await load(
    'src/utils/plantFilters.js',
  );
  const { indexSpeciesPresence } = await load('src/utils/speciesPresence.js');
  const plant = { id: 8, name: 'Menthe' };
  assert.equal(plantLinkedToMapZone(plant, { id: 'z1', species_ids: [8] }), true);
  // Nom seul (ancienne colonne `current_plant`, ou liste de noms sans jonction) : ignoré.
  assert.equal(
    plantLinkedToMapZone(plant, { id: 'z2', current_plant: 'Menthe', species_ids: [] }),
    false,
  );
  assert.equal(
    plantLinkedToMapMarker(plant, {
      id: 'm1',
      plant_name: 'Menthe',
      living_beings_list: ['Menthe'],
    }),
    false,
  );
  assert.equal(plantLinkedToMapMarker(plant, { id: 'm2', species_ids: ['8'] }), true);

  // Pastille « Sur la carte » : présence du serveur, sinon repli sur les lieux connus.
  const plants = [{ id: 7 }, { id: 8 }, { id: 9 }];
  const zones = [{ id: 'z1', species_ids: [8] }];
  const known = plantIdsMarkedOnMap(
    plants,
    indexSpeciesPresence([{ plant_id: 7, sources: ['registre'] }]),
    zones,
    [],
  );
  assert.deepEqual([...known], [7]);
  const unknown = plantIdsMarkedOnMap(plants, null, zones, []);
  assert.deepEqual([...unknown], [8]);
});

test('provenance lisible : registre, zones, repères', async () => {
  const { describePresenceSources, isRegistryOnly, presenceEntryForPlant, indexSpeciesPresence } =
    await load('src/utils/speciesPresence.js');
  assert.equal(
    describePresenceSources({
      sources: ['registre', 'zone', 'repere'],
      zones: [{ id: 'a' }, { id: 'b' }],
      markers: [{ id: 'm' }],
    }),
    'au registre du site · dans 2 zones · sur 1 repère',
  );
  // Lieux réservés au lecteur : le canal reste annoncé, sans nombre.
  assert.equal(describePresenceSources({ sources: ['zone'], zones: [] }), 'dans une zone');
  assert.equal(describePresenceSources(null), '');
  assert.equal(isRegistryOnly({ sources: ['registre'] }), true);
  assert.equal(isRegistryOnly({ sources: ['registre', 'zone'] }), false);
  const index = indexSpeciesPresence([{ plant_id: 3, sources: ['zone'] }]);
  assert.deepEqual(presenceEntryForPlant(index, { id: 3 }), { plant_id: 3, sources: ['zone'] });
  assert.equal(presenceEntryForPlant(index, 4), null);
  assert.equal(presenceEntryForPlant(null, 3), null);
  assert.equal(indexSpeciesPresence(undefined), null);
});
