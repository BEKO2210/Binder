// The interest catalogue: what somebody can put on their profile, grouped the
// way a person thinks about their life, with an emoji per entry.
//
// Two rules carry everything else:
//
// 1. The id is what the database stores, and it never changes. The twelve
//    original interests keep their exact stored strings ('Travel', 'Music', …)
//    as ids, so every existing profile row stays valid without a migration —
//    the server only checks cardinality, never a whitelist. New entries use
//    slug ids. The readable label always comes from the locale files as
//    identity.interests.<id>; interestLabel() falls back to the id itself for
//    a value that predates its translation.
//
// 2. This module imports nothing, so node:test can run against it directly and
//    the design verifiers (which scan screens/components) never see it. Emoji
//    live here as data — the same pattern as the locale flags in $meta.flag.
export type InterestCategoryId =
  | 'socialMedia'
  | 'sportFitness'
  | 'wellness'
  | 'creativity'
  | 'music'
  | 'outdoorThrill'
  | 'goingOut'
  | 'foodDrink'
  | 'fanFavorites'
  | 'activism'
  | 'tvFilm'
  | 'gaming'
  | 'stayingIn';

export const INTEREST_CATEGORIES: readonly InterestCategoryId[] = [
  'sportFitness',
  'outdoorThrill',
  'creativity',
  'music',
  'goingOut',
  'foodDrink',
  'tvFilm',
  'gaming',
  'stayingIn',
  'wellness',
  'socialMedia',
  'fanFavorites',
  'activism',
];

export type InterestEntry = {
  /** Stored in profiles.interests — permanent, never localized. */
  id: string;
  emoji: string;
  categoryId: InterestCategoryId;
};

const entry = (id: string, emoji: string, categoryId: InterestCategoryId): InterestEntry => ({ id, emoji, categoryId });

export const INTEREST_CATALOG: readonly InterestEntry[] = [
  // Sport und Fitness — 'Fitness' is legacy and keeps its stored string.
  entry('Fitness', '🏋️', 'sportFitness'),
  entry('gym', '💪', 'sportFitness'),
  entry('running', '🏃', 'sportFitness'),
  entry('jogging', '🏃‍♀️', 'sportFitness'),
  entry('yoga', '🧘', 'sportFitness'),
  entry('pilates', '🧘‍♀️', 'sportFitness'),
  entry('soccer', '⚽', 'sportFitness'),
  entry('basketball', '🏀', 'sportFitness'),
  entry('volleyball', '🏐', 'sportFitness'),
  entry('tennis', '🎾', 'sportFitness'),
  entry('padel', '🥎', 'sportFitness'),
  entry('tableTennis', '🏓', 'sportFitness'),
  entry('badminton', '🏸', 'sportFitness'),
  entry('swimming', '🏊', 'sportFitness'),
  entry('cycling', '🚴', 'sportFitness'),
  entry('skating', '⛸️', 'sportFitness'),
  entry('skateboarding', '🛹', 'sportFitness'),
  entry('martialArts', '🥋', 'sportFitness'),
  entry('boxing', '🥊', 'sportFitness'),
  entry('wrestling', '🤼', 'sportFitness'),
  entry('crossfit', '🏋️‍♀️', 'sportFitness'),
  entry('weightlifting', '🏋️‍♂️', 'sportFitness'),
  entry('gymnastics', '🤸', 'sportFitness'),
  entry('athletics', '🎽', 'sportFitness'),
  entry('marathon', '🏅', 'sportFitness'),
  entry('iceHockey', '🏒', 'sportFitness'),
  entry('fieldHockey', '🏑', 'sportFitness'),
  entry('rugby', '🏉', 'sportFitness'),
  entry('americanFootball', '🏈', 'sportFitness'),
  entry('baseball', '⚾', 'sportFitness'),
  entry('cricket', '🏏', 'sportFitness'),
  entry('horseRiding', '🏇', 'sportFitness'),
  entry('motorsport', '🏍️', 'sportFitness'),
  entry('carRacing', '🏎️', 'sportFitness'),
  entry('cheerleading', '📣', 'sportFitness'),
  entry('poleDancing', '💃', 'sportFitness'),
  entry('archery', '🏹', 'sportFitness'),
  entry('sportShooting', '🎯', 'sportFitness'),
  entry('walking', '🚶', 'sportFitness'),
  entry('homeWorkouts', '🏠', 'sportFitness'),

  // Outdoor und Nervenkitzel — 'Travel' and 'Hiking' are legacy.
  entry('Travel', '✈️', 'outdoorThrill'),
  entry('Hiking', '🥾', 'outdoorThrill'),
  entry('nature', '🏞️', 'outdoorThrill'),
  entry('mountains', '⛰️', 'outdoorThrill'),
  entry('camping', '🏕️', 'outdoorThrill'),
  entry('backpacking', '🎒', 'outdoorThrill'),
  entry('roadTrips', '🚗', 'outdoorThrill'),
  entry('beachLife', '🏖️', 'outdoorThrill'),
  entry('surfing', '🏄', 'outdoorThrill'),
  entry('sailing', '⛵', 'outdoorThrill'),
  entry('rowing', '🚣', 'outdoorThrill'),
  entry('canoeing', '🛶', 'outdoorThrill'),
  entry('paddleboarding', '🏄‍♀️', 'outdoorThrill'),
  entry('jetSki', '🚤', 'outdoorThrill'),
  entry('diving', '🤿', 'outdoorThrill'),
  entry('freeDiving', '🐠', 'outdoorThrill'),
  entry('fishing', '🎣', 'outdoorThrill'),
  entry('skiing', '⛷️', 'outdoorThrill'),
  entry('snowboarding', '🏂', 'outdoorThrill'),
  entry('climbing', '🧗', 'outdoorThrill'),
  entry('paragliding', '🪂', 'outdoorThrill'),
  entry('geocaching', '🧭', 'outdoorThrill'),
  entry('stargazing', '🔭', 'outdoorThrill'),
  entry('picnics', '🧺', 'outdoorThrill'),
  entry('hotSprings', '♨️', 'outdoorThrill'),
  entry('dogWalking', '🐕', 'outdoorThrill'),

  // Kreativität — 'Design', 'Photography', 'Books' are legacy.
  entry('Design', '📐', 'creativity'),
  entry('Photography', '📷', 'creativity'),
  entry('Books', '📚', 'creativity'),
  entry('painting', '🖌️', 'creativity'),
  entry('drawing', '✏️', 'creativity'),
  entry('writing', '✍️', 'creativity'),
  entry('poetry', '📝', 'creativity'),
  entry('literature', '📖', 'creativity'),
  entry('crafts', '🧶', 'creativity'),
  entry('diy', '🛠️', 'creativity'),
  entry('upcycling', '♻️', 'creativity'),
  entry('pottery', '🏺', 'creativity'),
  entry('tattoos', '🪡', 'creativity'),
  entry('fashion', '👗', 'creativity'),
  entry('vintageFashion', '🕶️', 'creativity'),
  entry('sneakers', '👟', 'creativity'),
  entry('makingMusic', '🎼', 'creativity'),
  entry('instruments', '🎸', 'creativity'),
  entry('singing', '🎤', 'creativity'),
  entry('choir', '🎶', 'creativity'),
  entry('dancing', '🩰', 'creativity'),
  entry('acting', '🎭', 'creativity'),
  entry('cosplay', '🦸', 'creativity'),
  entry('filmmaking', '🎥', 'creativity'),
  entry('contentCreation', '📱', 'creativity'),
  entry('blogging', '💻', 'creativity'),
  entry('languageExchange', '🗣️', 'creativity'),
  entry('entrepreneurship', '💼', 'creativity'),
  entry('investing', '📈', 'creativity'),

  // Musik — 'Music' is legacy.
  entry('Music', '🎵', 'music'),
  entry('livemusic', '🎫', 'music'),
  entry('concerts', '🎪', 'music'),
  entry('festivals', '🎡', 'music'),
  entry('hipHop', '🎧', 'music'),
  entry('rap', '🎙️', 'music'),
  entry('germanRap', '🇩🇪', 'music'),
  entry('pop', '🌟', 'music'),
  entry('rock', '🤘', 'music'),
  entry('punk', '⚡', 'music'),
  entry('heavyMetal', '🦇', 'music'),
  entry('indieMusic', '🎹', 'music'),
  entry('alternative', '🌀', 'music'),
  entry('techno', '🔊', 'music'),
  entry('house', '🏡', 'music'),
  entry('edm', '💿', 'music'),
  entry('electronicMusic', '🎛️', 'music'),
  entry('rnb', '💜', 'music'),
  entry('soul', '🎷', 'music'),
  entry('funk', '🕺', 'music'),
  entry('jazz', '🎺', 'music'),
  entry('classicalMusic', '🎻', 'music'),
  entry('opera', '🏛️', 'music'),
  entry('kpop', '🇰🇷', 'music'),
  entry('jpop', '🇯🇵', 'music'),
  entry('latinMusic', '💃', 'music'),
  entry('reggaeton', '🥁', 'music'),
  entry('afrobeats', '🌍', 'music'),
  entry('country', '🤠', 'music'),
  entry('folk', '🪕', 'music'),
  entry('gospel', '🙏', 'music'),
  entry('karaoke', '🎤', 'music'),
  entry('vinyl', '📀', 'music'),

  // Ausgehen
  entry('nightlife', '🌃', 'goingOut'),
  entry('clubbing', '🪩', 'goingOut'),
  entry('raves', '🕺', 'goingOut'),
  entry('bars', '🍺', 'goingOut'),
  entry('pubs', '🍻', 'goingOut'),
  entry('barHopping', '🍹', 'goingOut'),
  entry('happyHour', '🍸', 'goingOut'),
  entry('houseParties', '🎉', 'goingOut'),
  entry('shisha', '💨', 'goingOut'),
  entry('theatre', '🎭', 'goingOut'),
  entry('musicals', '🎼', 'goingOut'),
  entry('standUpComedy', '😂', 'goingOut'),
  entry('museums', '🏛️', 'goingOut'),
  entry('artGalleries', '🖼️', 'goingOut'),
  entry('exhibitions', '🖼️', 'goingOut'),
  entry('cinema', '🎬', 'goingOut'),
  entry('driveInCinema', '🚙', 'goingOut'),
  entry('filmFestivals', '🎞️', 'goingOut'),
  entry('escapeRooms', '🗝️', 'goingOut'),
  entry('bowling', '🎳', 'goingOut'),
  entry('billiards', '🎱', 'goingOut'),
  entry('darts', '🎯', 'goingOut'),
  entry('pubQuiz', '❓', 'goingOut'),
  entry('shopping', '🛍️', 'goingOut'),
  entry('secondHand', '👜', 'goingOut'),
  entry('fleaMarkets', '🧸', 'goingOut'),
  entry('streetFests', '🎪', 'goingOut'),
  entry('rollerSkating', '🛼', 'goingOut'),
  entry('cars', '🚘', 'goingOut'),
  entry('motorcycles', '🏍️', 'goingOut'),
  entry('aquarium', '🐠', 'goingOut'),
  entry('zoo', '🦁', 'goingOut'),

  // Essen und Trinken — 'Food' and 'Coffee' are legacy.
  entry('Food', '🍽️', 'foodDrink'),
  entry('Coffee', '☕', 'foodDrink'),
  entry('cooking', '👩‍🍳', 'foodDrink'),
  entry('baking', '🧁', 'foodDrink'),
  entry('bbq', '🍖', 'foodDrink'),
  entry('brunch', '🥞', 'foodDrink'),
  entry('foodie', '🍴', 'foodDrink'),
  entry('foodTours', '📍', 'foodDrink'),
  entry('streetFood', '🌮', 'foodDrink'),
  entry('sushi', '🍣', 'foodDrink'),
  entry('ramen', '🍜', 'foodDrink'),
  entry('pho', '🍲', 'foodDrink'),
  entry('koreanFood', '🍚', 'foodDrink'),
  entry('italianFood', '🍝', 'foodDrink'),
  entry('pizza', '🍕', 'foodDrink'),
  entry('plantBased', '🥗', 'foodDrink'),
  entry('sweets', '🍭', 'foodDrink'),
  entry('iceCream', '🍦', 'foodDrink'),
  entry('tea', '🍵', 'foodDrink'),
  entry('bubbleTea', '🧋', 'foodDrink'),
  entry('mocktails', '🍹', 'foodDrink'),
  entry('cocktails', '🍸', 'foodDrink'),
  entry('wine', '🍷', 'foodDrink'),
  entry('craftBeer', '🍺', 'foodDrink'),
  entry('acai', '🫐', 'foodDrink'),

  // Fernsehen und Filme
  entry('movies', '🎬', 'tvFilm'),
  entry('actionMovies', '💥', 'tvFilm'),
  entry('comedy', '😄', 'tvFilm'),
  entry('romcoms', '💘', 'tvFilm'),
  entry('dramaSeries', '🎭', 'tvFilm'),
  entry('thriller', '😱', 'tvFilm'),
  entry('horror', '👻', 'tvFilm'),
  entry('scifi', '👽', 'tvFilm'),
  entry('fantasyMovies', '🐉', 'tvFilm'),
  entry('animation', '🎞️', 'tvFilm'),
  entry('anime', '⛩️', 'tvFilm'),
  entry('kdrama', '🇰🇷', 'tvFilm'),
  entry('bollywood', '🇮🇳', 'tvFilm'),
  entry('crime', '🕵️', 'tvFilm'),
  entry('documentaries', '📹', 'tvFilm'),
  entry('realityTv', '📺', 'tvFilm'),
  entry('indieFilms', '🎦', 'tvFilm'),
  entry('sportsOnTv', '🏟️', 'tvFilm'),
  entry('bingeWatching', '🛋️', 'tvFilm'),

  // Gaming — 'Gaming' is legacy.
  entry('Gaming', '🎮', 'gaming'),
  entry('esports', '🏆', 'gaming'),
  entry('playstation', '🕹️', 'gaming'),
  entry('xbox', '🎮', 'gaming'),
  entry('nintendo', '🍄', 'gaming'),
  entry('pcGaming', '🖥️', 'gaming'),
  entry('retroGames', '👾', 'gaming'),
  entry('onlineGames', '🌐', 'gaming'),
  entry('mobileGames', '📱', 'gaming'),
  entry('fortnite', '🛡️', 'gaming'),
  entry('leagueOfLegends', '⚔️', 'gaming'),
  entry('amongUs', '🚀', 'gaming'),
  entry('minecraft', '⛏️', 'gaming'),
  entry('roblox', '🧱', 'gaming'),
  entry('boardGames', '🎲', 'gaming'),
  entry('chess', '♟️', 'gaming'),
  entry('cardGames', '🃏', 'gaming'),
  entry('dnd', '🐲', 'gaming'),
  entry('puzzles', '🧩', 'gaming'),
  entry('trivia', '💡', 'gaming'),

  // Daheim bleiben — 'Dogs' is legacy.
  entry('Dogs', '🐶', 'stayingIn'),
  entry('cats', '🐱', 'stayingIn'),
  entry('pets', '🐾', 'stayingIn'),
  entry('reading', '📖', 'stayingIn'),
  entry('podcastsListening', '🎧', 'stayingIn'),
  entry('audiobooks', '🔉', 'stayingIn'),
  entry('gardening', '🪴', 'stayingIn'),
  entry('houseplants', '🌱', 'stayingIn'),
  entry('interiorDesign', '🛋️', 'stayingIn'),
  entry('onlineShopping', '🛒', 'stayingIn'),
  entry('journaling', '📔', 'stayingIn'),
  entry('learningLanguages', '🈯', 'stayingIn'),
  entry('astronomy', '🌌', 'stayingIn'),
  entry('history', '🏺', 'stayingIn'),
  entry('science', '🔬', 'stayingIn'),
  entry('philosophy', '🤔', 'stayingIn'),
  entry('lazySundays', '😴', 'stayingIn'),

  // Wellness und Lifestyle
  entry('selfCare', '🌼', 'wellness'),
  entry('selfLove', '💖', 'wellness'),
  entry('meditation', '🧘', 'wellness'),
  entry('mindfulness', '🪷', 'wellness'),
  entry('mentalHealth', '🧠', 'wellness'),
  entry('personalGrowth', '📊', 'wellness'),
  entry('tryingNewThings', '🦋', 'wellness'),
  entry('activeLifestyle', '🏃‍♂️', 'wellness'),
  entry('spa', '🕯️', 'wellness'),
  entry('sauna', '🧖', 'wellness'),
  entry('skincare', '🧴', 'wellness'),
  entry('makeup', '💄', 'wellness'),
  entry('astrology', '🔮', 'wellness'),
  entry('tarot', '🃏', 'wellness'),
  entry('spirituality', '✨', 'wellness'),
  entry('nutrition', '🥑', 'wellness'),
  entry('coldPlunge', '🧊', 'wellness'),

  // Social Media und Digital — 'Tech' is legacy.
  entry('Tech', '🤖', 'socialMedia'),
  entry('instagram', '📸', 'socialMedia'),
  entry('tiktok', '📱', 'socialMedia'),
  entry('youtube', '📺', 'socialMedia'),
  entry('twitch', '🎥', 'socialMedia'),
  entry('spotify', '🎧', 'socialMedia'),
  entry('podcasting', '🎙️', 'socialMedia'),
  entry('vlogging', '🤳', 'socialMedia'),
  entry('memes', '🤡', 'socialMedia'),
  entry('netflix', '🎬', 'socialMedia'),
  entry('virtualReality', '🥽', 'socialMedia'),
  entry('ai', '🧠', 'socialMedia'),
  entry('crypto', '🪙', 'socialMedia'),
  entry('coding', '⌨️', 'socialMedia'),

  // Fan-Favoriten
  entry('harryPotter', '⚡', 'fanFavorites'),
  entry('marvel', '🦸‍♂️', 'fanFavorites'),
  entry('starWars', '🌌', 'fanFavorites'),
  entry('lordOfTheRings', '💍', 'fanFavorites'),
  entry('gameOfThrones', '🐺', 'fanFavorites'),
  entry('disney', '🏰', 'fanFavorites'),
  entry('manga', '📓', 'fanFavorites'),
  entry('comics', '💬', 'fanFavorites'),
  entry('comicConventions', '🦹', 'fanFavorites'),
  entry('nineties', '📼', 'fanFavorites'),
  entry('nba', '🏀', 'fanFavorites'),
  entry('formula1', '🏁', 'fanFavorites'),
  entry('bundesliga', '⚽', 'fanFavorites'),
  entry('champions', '🏆', 'fanFavorites'),

  // Aktivismus und Werte
  entry('volunteering', '🤝', 'activism'),
  entry('activism', '✊', 'activism'),
  entry('climateAction', '🌍', 'activism'),
  entry('environment', '🌿', 'activism'),
  entry('animalWelfare', '🐾', 'activism'),
  entry('humanRights', '⚖️', 'activism'),
  entry('equality', '🟰', 'activism'),
  entry('feminism', '♀️', 'activism'),
  entry('lgbtqRights', '🏳️‍🌈', 'activism'),
  entry('pride', '🌈', 'activism'),
  entry('inclusion', '🧩', 'activism'),
  entry('politics', '🗳️', 'activism'),
  entry('worldPeace', '🕊️', 'activism'),
  entry('communityWork', '🏘️', 'activism'),
];

/** Stored-value → entry, for rendering values that came from the database. */
const catalogById = new Map(INTEREST_CATALOG.map((item) => [item.id, item]));

export function interestEntry(id: string): InterestEntry | undefined {
  return catalogById.get(id);
}

export function interestsInCategory(categoryId: InterestCategoryId): readonly InterestEntry[] {
  return INTEREST_CATALOG.filter((item) => item.categoryId === categoryId);
}

/** The i18n key for an entry's label.
 *
 * The first letter is lowered because the twelve legacy ids start uppercase
 * ('Travel') while their keys shipped lowercase (identity.interests.travel)
 * earlier today — reusing those keys beats duplicating them. Every new id is
 * already camelCase, so for them this is the identity function. */
export function catalogLabelKey(id: string): string {
  return `identity.interests.${id.charAt(0).toLowerCase()}${id.slice(1)}`;
}

export function categoryLabelKey(categoryId: InterestCategoryId): string {
  return `identity.interestCategories.${categoryId}`;
}

/** How many interests one profile may carry. The DB check allows 12; the
 * picker offers 10 so legacy profiles with more never break. */
export const INTEREST_SELECTION_LIMIT = 10;
