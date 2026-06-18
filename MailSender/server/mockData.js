// Mock data that mirrors the AFFA Fantasy / PFL API contract.
// Swap this module out for real API calls (see server/dataSource.js) once the
// live PFL endpoint + Bearer token are available — the shapes below are the
// contract the rest of the app relies on.

const photo = (n) => `https://i.pravatar.cc/160?img=${n}`;

// 1) Players database — ID, Ad, Soyad, Mövqe, Klub, Forma nömrəsi, Foto
export const players = [
  { id: 1, firstName: 'Şahrudin', lastName: 'Mahammadaliyev', position: 'Qapıçı', club: 'Qarabağ', jerseyNumber: 1, photo: photo(11) },
  { id: 2, firstName: 'Bəhlul', lastName: 'Mustafazadə', position: 'Müdafiəçi', club: 'Qarabağ', jerseyNumber: 4, photo: photo(12) },
  { id: 3, firstName: 'Kevin', lastName: 'Medina', position: 'Müdafiəçi', club: 'Qarabağ', jerseyNumber: 13, photo: photo(13) },
  { id: 4, firstName: 'Marko', lastName: 'Janković', position: 'Yarımmüdafiəçi', club: 'Qarabağ', jerseyNumber: 8, photo: photo(14) },
  { id: 5, firstName: 'Abdellah', lastName: 'Zoubir', position: 'Hücumçu', club: 'Qarabağ', jerseyNumber: 10, photo: photo(15) },
  { id: 6, firstName: 'Salahat', lastName: 'Aghayev', position: 'Qapıçı', club: 'Neftçi', jerseyNumber: 1, photo: photo(16) },
  { id: 7, firstName: 'Anatoliy', lastName: 'Nuriyev', position: 'Müdafiəçi', club: 'Neftçi', jerseyNumber: 3, photo: photo(17) },
  { id: 8, firstName: 'Emin', lastName: 'Mahmudov', position: 'Yarımmüdafiəçi', club: 'Neftçi', jerseyNumber: 7, photo: photo(18) },
  { id: 9, firstName: 'Vincent', lastName: 'Angban', position: 'Yarımmüdafiəçi', club: 'Neftçi', jerseyNumber: 6, photo: photo(19) },
  { id: 10, firstName: 'Mahir', lastName: 'Emreli', position: 'Hücumçu', club: 'Neftçi', jerseyNumber: 9, photo: photo(20) },
  { id: 11, firstName: 'Davit', lastName: 'Kobouri', position: 'Qapıçı', club: 'Zirə', jerseyNumber: 12, photo: photo(21) },
  { id: 12, firstName: 'Rahil', lastName: 'Mammadov', position: 'Müdafiəçi', club: 'Zirə', jerseyNumber: 5, photo: photo(22) },
  { id: 13, firstName: 'Joy-Lance', lastName: 'Mickels', position: 'Hücumçu', club: 'Zirə', jerseyNumber: 11, photo: photo(23) },
  { id: 14, firstName: 'Elvin', lastName: 'Jamalov', position: 'Yarımmüdafiəçi', club: 'Sabah', jerseyNumber: 8, photo: photo(24) },
  { id: 15, firstName: 'Steeven', lastName: 'Joseph-Monrose', position: 'Hücumçu', club: 'Sabah', jerseyNumber: 9, photo: photo(25) },
  { id: 16, firstName: 'Coulibaly', lastName: 'Nouha', position: 'Müdafiəçi', club: 'Sabah', jerseyNumber: 4, photo: photo(26) },
  { id: 17, firstName: 'Rashad', lastName: 'Azizli', position: 'Qapıçı', club: 'Sumqayıt', jerseyNumber: 1, photo: photo(27) },
  { id: 18, firstName: 'Namig', lastName: 'Alasgarov', position: 'Hücumçu', club: 'Sumqayıt', jerseyNumber: 10, photo: photo(28) },
  { id: 19, firstName: 'Tellur', lastName: 'Mutallimov', position: 'Müdafiəçi', club: 'Səbail', jerseyNumber: 3, photo: photo(29) },
  { id: 20, firstName: 'Murad', lastName: 'Aghayev', position: 'Yarımmüdafiəçi', club: 'Səbail', jerseyNumber: 7, photo: photo(30) },
];

const clubs = [...new Set(players.map((p) => p.club))];

// 2) Lineups — published before kickoff: start XI + substitutes per match.
// References players by id; fields per spec: ID, Ad, Soyad, Mövqe, Forma nömrəsi, Foto.
function lineupPlayer(id) {
  const p = players.find((x) => x.id === id);
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    position: p.position,
    jerseyNumber: p.jerseyNumber,
    photo: p.photo,
  };
}

export const lineups = [
  {
    matchId: 101,
    round: 1,
    homeTeam: 'Qarabağ',
    awayTeam: 'Neftçi',
    startXI: [1, 2, 3, 4, 5].map(lineupPlayer),
    substitutes: [6, 7].map(lineupPlayer),
  },
  {
    matchId: 102,
    round: 1,
    homeTeam: 'Zirə',
    awayTeam: 'Sabah',
    startXI: [11, 12, 13].map(lineupPlayer),
    substitutes: [14, 15].map(lineupPlayer),
  },
];

// 3) Season fixtures — Tur nömrəsi, tarix, başlama saatı, ev sahibi, qonaq
export const fixtures = [
  { round: 1, date: '2026-08-08', time: '19:00', homeTeam: 'Qarabağ', awayTeam: 'Neftçi' },
  { round: 1, date: '2026-08-09', time: '17:00', homeTeam: 'Zirə', awayTeam: 'Sabah' },
  { round: 1, date: '2026-08-09', time: '19:30', homeTeam: 'Sumqayıt', awayTeam: 'Səbail' },
  { round: 2, date: '2026-08-15', time: '19:00', homeTeam: 'Neftçi', awayTeam: 'Zirə' },
  { round: 2, date: '2026-08-16', time: '18:00', homeTeam: 'Sabah', awayTeam: 'Sumqayıt' },
  { round: 2, date: '2026-08-16', time: '20:30', homeTeam: 'Səbail', awayTeam: 'Qarabağ' },
  { round: 3, date: '2026-08-22', time: '19:00', homeTeam: 'Qarabağ', awayTeam: 'Sabah' },
  { round: 3, date: '2026-08-23', time: '19:30', homeTeam: 'Zirə', awayTeam: 'Sumqayıt' },
];

export const seedData = { players, lineups, fixtures, clubs };
