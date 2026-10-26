// SlimeVR Mod : numero de version affiche en haut de l'app.
// Grosse mise a jour : +0.1 (0.7 -> 0.8), major: true.
// Petite mise a jour (correctif, petit reglage) : +0.0.1 (0.7 -> 0.7.1).
// Ajouter les nouveautes en haut de MOD_CHANGELOG a chaque fois.
export const MOD_VERSION = '1.1';

export type ModChangelogEntry = {
  version: string;
  major?: boolean;
  changes: string[];
};

export const MOD_CHANGELOG: ModChangelogEntry[] = [
  {
    version: '1.1',
    major: true,
    changes: [
      'BOBvr passe sur la nouvelle base SlimeVR v22 (bêta) : nouveau serveur, nouveau squelette, nouvelle correction de glissade des pieds, profils de réglages.',
      'Profils Normal, Danse et Origine (boutons à gauche du squelette ou en haut à droite). Origine = SlimeVR de base, sans les corrections du mod.',
      'Toutes les corrections du mod refaites pour la nouvelle base : genoux qui ne suivent pas les grands mouvements de hanches, dos assis (on peut toujours se pencher), assis sur les talons, rien de bloqué allongé, glisse après un raté du Wi-Fi, signal aux capteurs 10 fois par seconde.',
      'Les pieds ne sont jamais bloqués au sol allongé ou un genou par terre.',
      'Bob qui danse à la place des slimes partout (aucun capteur connecté, chargement, etc.).',
      'Logo et musique de Bob, thème noir et blanc, alerte de mise à jour du site, « ? » des nouveautés, installeur et lancement avec SteamVR.',
      'Retirés : le mode 5 capteurs (torse estimé) et le kit chevilles + coudes.',
    ],
  },
  {
    version: '0.9.3',
    changes: [
      'Assis : tu peux te pencher en avant. Seul un dos un peu avachi est redressé, une vraie penchée passe en entier.',
      'Plus fluide quand le Wi-Fi d’un capteur a un raté : pendant la coupure le membre ne part plus tout seul (plus de prédiction dans le vide), et quand il revient il glisse jusqu’à sa place au lieu de sauter (sauf en mode Origine).',
      'Les capteurs restent mieux connectés : le serveur leur parle 10 fois par seconde au lieu de 2, donc avec un Wi-Fi qui perd des paquets ils décrochent beaucoup moins souvent.',
    ],
  },
  {
    version: '0.9.2',
    changes: [
      'Debout sur une jambe en pliant l’autre genou (talon vers l’arrière) : le tibia bouge librement, il ne reste plus coincé à l’horizontale. La correction « assis sur les talons » ne s’active plus que quand les deux jambes sont repliées.',
    ],
  },
  {
    version: '0.9.1',
    changes: [
      'VRChat : quand un capteur redémarre ou perd le Wi-Fi un instant, son capteur SteamVR reste allumé, donc la jambe (ou le torse, la hanche…) ne disparaît plus à la calibration.',
      'Assis sur les talons : les jambes restent repliées droit sous le corps au lieu de se lever ou de partir sur les côtés (pour 5, 6, 8 ou 10 capteurs).',
      'Allongé ou à moitié allongé : le corps reste droit (les corrections du bassin et du dos s’arrêtent plus tôt quand on se penche en arrière).',
      'Mode normal : recentrage en douceur au double tap, comme en mode danse.',
      'Mode normal : lissage léger, plier le genou et lever la jambe est moins brusque.',
      'Au premier démarrage de cette version, l’app repasse en mode normal avec les nouveaux réglages.',
      'Correctif : quand un capteur se reconnectait, l’app pouvait sauvegarder des réglages incomplets, et en quittant le mode Origine ou Danse tout se retrouvait coupé (plus de double tap en douceur, plus de genoux étendus, prédiction au lieu du lissage). Les bons réglages du mode normal sont remis une fois.',
      'Allongé dans le lit, à moitié allongé ou accroupi bas : les pieds ne sont plus jamais bloqués au sol, donc les hanches et les jambes ne se tordent plus.',
      'Debout en pliant les genoux : relâchement des pieds plus doux (0,25 s au lieu de 0,15 s), sans blocage puis à-coup.',
    ],
  },
  {
    version: '0.9',
    major: true,
    changes: [
      'Mode 5 capteurs : torse virtuel. Les hanches sont placées à partir des jambes posées au sol et le dos se plie pour rejoindre le casque, donc les hanches bougent séparément du torse comme avec 6 capteurs.',
      'Mode normal : genoux étendus comme en mode danse (jambes plus naturelles).',
      'Nouveau bouton « OG » à côté du mode danse : mode Origine, tout comme SlimeVR de base (réglages officiels, corrections du mod coupées).',
      'Thème noir et blanc par défaut.',
    ],
  },
  {
    version: '0.8',
    major: true,
    changes: [
      'Alerte de mise à jour : l’app prévient quand une nouvelle version de BOBvr est sur le site bonjour-bobvr.netlify.app, avec un bouton pour la télécharger.',
    ],
  },
  {
    version: '0.7.2',
    changes: ['« Mise à jour » est écrit sous le bouton « ? » en haut.'],
  },
  {
    version: '0.7.1',
    changes: [
      'Après une petite mise à jour, les nouveautés de la dernière grosse mise à jour restent affichées.',
    ],
  },
  {
    version: '0.7',
    changes: ['Le bouton « ? » en haut affiche les nouveautés de chaque mise à jour.'],
  },
  {
    version: '0.6',
    major: true,
    changes: [
      'SlimeVR Mod peut se lancer tout seul au démarrage de SteamVR (à activer dans SteamVR > Réglages > Démarrage/Arrêt).',
      'L’installeur enregistre aussi SlimeVR Mod dans SteamVR.',
    ],
  },
  {
    version: '0.5',
    major: true,
    changes: [
      'Nouveau kit 8 capteurs « chevilles et coudes » : torse, hanche, cuisses, chevilles et coudes (sans pieds).',
    ],
  },
  {
    version: '0.4',
    major: true,
    changes: [
      'Kit 8 capteurs « pieds et coudes » avec le tibia estimé depuis le pied (remplacé en v0.5).',
    ],
  },
  {
    version: '0.3',
    major: true,
    changes: [
      'Blocage des pieds refait : il utilise directement les trackers de pieds, donc les pieds restent au sol même quand les hanches bougent beaucoup.',
      'Relâchement des pieds en douceur quand on les lève (plus de coupure).',
      'Mode 5 capteurs : le buste ne copie plus la hanche, les hanches bougent librement comme avec 6 capteurs.',
      'Numéro de version dans la pastille en haut.',
    ],
  },
  {
    version: '0.2 et avant',
    major: true,
    changes: [
      'Réglages de base 1:1 (suivre les trackers au plus juste), recentrage par double tap en douceur.',
      'Mode Danse (bouton en bas à gauche) avec ses propres réglages.',
      'Genoux moins entraînés par les hanches, dos moins courbé en position assise, genoux qui ne remontent plus assis sur les talons.',
      'Mode 5 capteurs avec la hanche à la place du torse.',
      'Logo, animation et musique de Bob au démarrage, thème noir et blanc.',
      'Installeur qui met à jour une version déjà installée.',
    ],
  },
];
