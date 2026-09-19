// Label operativa SOLO staff per prodotti dal nome commerciale simile ma diversi per
// categoria/preparazione (segnalato da Eros: errori di confusione in coda). Match su
// itemId reale (kitchenMockData.js), non sul nome — mai mostrata al cliente.
// Fonte unica condivisa: KitchenSoloService.jsx (/kitchen/solo) e KitchenPrepBoardView.jsx
// (/kitchen/prep) leggono da qui, cosi' le due dashboard staff non possono divergere.
export const STAFF_DISAMBIGUATION_LABEL = {
  'item-017': 'PANINO',           // Mortazza Classe Alta
  'item-034': 'CICCHETTO',        // Mortazza
  'item-014': 'PROSCIUTTO CRUDO', // Crudo Ma Educato
  'item-012': 'CARNE CRUDA',      // Crudo Vero
};
