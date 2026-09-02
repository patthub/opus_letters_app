// Dwie wersje jezykowe jednej strony, nie dwie kopie serwisu. Tresc listow zostaje po
// angielsku zawsze — to zrodla, nie interfejs; tlumaczy sie aparat katalogu wokol nich.

export const T = {
  pl: {
    htmlLang: 'pl',
    title: 'OPUS — korespondencja Henry’ego Wottona',
    subtitle: 'Korespondencja Henry’ego&nbsp;Wottona',
    nav: { letters: 'Listy', time: 'Czas', people: 'Ludzie', places: 'Miejsca', query: 'Zapytanie' },
    find: 'szukaj w incipitach, nazwiskach, tematach…',
    connecting: 'łączę z Neo4j',

    tally: { letters: 'listów', people: 'korespondentów', places: 'miejsc', doubt: 'dat niepewnych' },
    source: 'źródło', snapshot: 'snapshot',

    noData: 'Nie ma skąd wziąć danych.',
    noDataSub: 'ani Neo4j na bolt://localhost:7687, ani opus.json',
    noMatch: 'Nic nie pasuje.',
    noMatchSub: n => `Wyczyść szukanie albo zdejmij filtr — korpus ma ${n} listów.`,
    undated: 'bez daty',
    noIncipit: 'bez incipitu',
    editorDate: 'data od redaktora',
    more: n => `pokaż kolejne ${n}`,

    precTitle: { 10: 'znany dzień', 7: 'tylko miesiąc', 4: 'tylko rok', 0: 'bez daty' },
    legend: {
      day: 'znany dzień', month: 'tylko miesiąc', year: 'tylko rok',
      editorial: 'data od redaktora — wywnioskowana, niepewna lub przybliżona',
    },
    nothingDated: 'Nic z datą.',
    nothingDatedSub: 'Zdejmij filtr, żeby zobaczyć całą oś.',
    nowhere: 'bez miejsca',
    placeUnknown: 'miejsce nieznane',

    pickPerson: 'Wybierz korespondenta.',
    sent: 'wysłanych', received: 'otrzymanych', correspondents: 'korespondentów',
    showLetters: 'pokaż te listy',
    sentFrom: n => `stąd wysłano ${n}`,
    arrived: n => `dotarło tu ${n}`,
    mapFail: 'Leaflet się nie wczytał.',
    mapFailSub: 'Sprawdź połączenie z siecią.',

    run: 'Uruchom', running: 'liczę…',
    zeroRows: 'Zero wierszy.',
    zeroRowsSub: 'Zapytanie jest poprawne, tylko nic nie pasuje.',
    first300: n => `pokazane pierwsze 300 z ${n}`,
    queryOffline: 'Konsola Cypher działa tylko przy żywej bazie.',
    queryOfflineSub: 'Ta kopia serwisu czyta zamrożony snapshot korpusu — nie ma silnika, który ' +
      'wykonałby zapytanie. Pozostałe cztery widoki mają komplet danych.<br><br>' +
      'Żeby pisać zapytania, uruchom bazę u siebie: <code>docker compose up -d</code> ' +
      'i otwórz serwis z <code>localhost</code>.',
    nodes: 'węzłów', path: 'ścieżka',
    recipes: ['najczęściej wzmiankowani', 'listy o szpiegostwie', 'ścieżka między dwiema osobami',
              'skąd i dokąd', 'co jest w bazie'],

    letter: 'list', close: 'zamknij',
    inferred: 'wywnioskowana', uncertain: 'niepewna', approximate: 'przybliżona',
    abstract: 'Streszczenie', record: 'Rekord',
    from: 'od', to: 'do', origin: 'z', dest: 'dokąd', language: 'język', edition: 'edycja',
    subjects: 'Tematy', mentioned: 'Wzmiankowani',
    born: 'ur.', died: 'zm.', role: 'rola',

    fSubject: 'temat', fPlace: 'miejsce', clear: 'wyczyść',
    cypherLive: 'Cypher — pisz własne',
    cypherFrozen: 'Cypher — wymaga żywej bazy',
    placesTitle: 'Miejsca nadania i przeznaczenia',
  },

  en: {
    htmlLang: 'en',
    title: 'OPUS — the correspondence of Sir Henry Wotton',
    subtitle: 'The correspondence of Sir&nbsp;Henry&nbsp;Wotton',
    nav: { letters: 'Letters', time: 'Time', people: 'People', places: 'Places', query: 'Query' },
    find: 'search incipits, names, subjects…',
    connecting: 'connecting to Neo4j',

    tally: { letters: 'letters', people: 'correspondents', places: 'places', doubt: 'uncertain dates' },
    source: 'source', snapshot: 'snapshot',

    noData: 'No data to read.',
    noDataSub: 'neither Neo4j on bolt://localhost:7687 nor opus.json',
    noMatch: 'Nothing matches.',
    noMatchSub: n => `Clear the search or drop the filter — the corpus holds ${n} letters.`,
    undated: 'undated',
    noIncipit: 'no incipit',
    editorDate: 'date supplied by the editor',
    more: n => `show ${n} more`,

    precTitle: { 10: 'day known', 7: 'month only', 4: 'year only', 0: 'undated' },
    legend: {
      day: 'day known', month: 'month only', year: 'year only',
      editorial: 'date supplied by the editor — inferred, uncertain or approximate',
    },
    nothingDated: 'Nothing dated.',
    nothingDatedSub: 'Drop the filter to see the whole span.',
    nowhere: 'no place given',
    placeUnknown: 'place unknown',

    pickPerson: 'Pick a correspondent.',
    sent: 'sent', received: 'received', correspondents: 'correspondents',
    showLetters: 'show these letters',
    sentFrom: n => `${n} sent from here`,
    arrived: n => `${n} arrived here`,
    mapFail: 'Leaflet did not load.',
    mapFailSub: 'Check the network connection.',

    run: 'Run', running: 'running…',
    zeroRows: 'No rows.',
    zeroRowsSub: 'The query is valid, nothing matches it.',
    first300: n => `showing the first 300 of ${n}`,
    queryOffline: 'The Cypher console needs a live database.',
    queryOfflineSub: 'This copy reads a frozen snapshot of the corpus — there is no engine to run ' +
      'a query against. The other four views hold the complete data.<br><br>' +
      'To write queries, run the database yourself: <code>docker compose up -d</code> ' +
      'and open the site from <code>localhost</code>.',
    nodes: 'nodes', path: 'path',
    recipes: ['most often mentioned', 'letters on espionage', 'path between two people',
              'from and to', "what is in the database"],

    letter: 'letter', close: 'close',
    inferred: 'inferred', uncertain: 'uncertain', approximate: 'approximate',
    abstract: 'Abstract', record: 'Record',
    from: 'from', to: 'to', origin: 'sent from', dest: 'sent to', language: 'language', edition: 'edition',
    subjects: 'Subjects', mentioned: 'Mentioned',
    born: 'born', died: 'died', role: 'role',

    fSubject: 'subject', fPlace: 'place', clear: 'clear',
    cypherLive: 'Cypher — write your own',
    cypherFrozen: 'Cypher — needs a live database',
    placesTitle: 'Places of origin and destination',
  },
};

// ?lang= wygrywa (da sie wyslac link), potem wybor zapamietany, na koncu jezyk przegladarki
export function pickLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (T[q]) return q;
  try {
    const saved = localStorage.getItem('opus.lang');
    if (T[saved]) return saved;
  } catch { /* prywatne okno — trudno */ }
  return navigator.language?.startsWith('pl') ? 'pl' : 'en';
}
