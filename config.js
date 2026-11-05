// Datos fijos de la marca. Editá acá sedes, barberos, horarios y servicios.
// Horarios en formato 24 hs (hora de Buenos Aires).

module.exports = {
  timezone: 'America/Argentina/Buenos_Aires',
  // Días de atención: 0 = domingo ... 6 = sábado
  diasAbiertos: [2, 3, 4, 5, 6],
  intervaloMin: 30,          // cada cuánto se ofrece un turno
  diasReservables: 10,       // cuántos días hábiles hacia adelante muestra el turnero

  sedes: [
    {
      id: 'parque-chas',
      nombre: 'Parque Chas',
      direccion: 'Av. de los Incas 4573',
      whatsapp: '5491130681320',
      telefono: '+54 9 11 3068-1320',
      maps: 'Av. de los Incas 4573, C1427 CABA, Argentina',
    },
    {
      id: 'villa-urquiza',
      nombre: 'Villa Urquiza',
      direccion: 'Av. Juramento 5273',
      whatsapp: '5491132070838',
      telefono: '+54 9 11 3207-0838',
      maps: 'Av. Juramento 5273, C1431 CABA, Argentina',
    },
  ],

  // desde = primer turno · hasta = último turno (con 10:00 y 19:30 se ofrecen 10:00, 10:30 … 19:30).
  barberos: [
    { id: 'demian', nombre: 'Demian', sede: 'parque-chas', desde: '10:00', hasta: '19:30' },
    { id: 'lionel', nombre: 'Lionel', sede: 'parque-chas', desde: '10:00', hasta: '19:30' },
    { id: 'alex', nombre: 'Alex', sede: 'parque-chas', desde: '16:00', hasta: '19:30' },
    { id: 'gaspar', nombre: 'Gaspar', sede: 'villa-urquiza', desde: '10:00', hasta: '19:30' },
  ],

  servicios: [
    { id: 'fade', nombre: 'Fade', desc: 'Degradados y transiciones precisas.' },
    { id: 'clasico', nombre: 'Cortes clásicos', chip: 'Corte clásico', desc: 'Estilos atemporales adaptados a cada cliente.' },
    { id: 'tijera', nombre: 'Cortes a tijera', chip: 'Corte a tijera', desc: 'Trabajo personalizado y atención al detalle.' },
    { id: 'navaja', nombre: 'Perfilado con navaja', desc: 'Definición y terminaciones prolijas.' },
    { id: 'cejas', nombre: 'Cejas', desc: 'Diseño y perfilado de cejas.' },
    { id: 'afeitado', nombre: 'Afeitado tradicional', desc: 'Navaja y shaver.' },
    {
      id: 'asesoramiento',
      nombre: 'Asesoramiento personalizado',
      chip: 'Asesoramiento',
      desc: 'Te ayudamos a encontrar el corte y el estilo que mejor se adapten a tus facciones, tipo de cabello y preferencias, con seguimiento para mantener tu imagen.',
      destacado: true,
    },
  ],

  categoriasProducto: ['POMADA', 'STYLING', 'BARBA', 'OTRO'],

  instagram: {
    studio: 'properhousestudio',
    store: 'properhousestore',
  },
};
