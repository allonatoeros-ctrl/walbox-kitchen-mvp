# WALBOX — DECISION MATRIX
> Criteri per scegliere KEEP / CLEANUP / REBUILD.  
> Da usare dopo audit read-only del repo attuale.

---

## Opzioni

### KEEP

Continuare sul repo attuale senza cleanup significativo.

Scegli KEEP se:

- il repo è già ordinato;
- le route principali sono chiare;
- i file legacy non confondono Claude;
- build/test passano;
- il percorso verso V1 vendibile è breve;
- non ci sono duplicati pericolosi.

### CLEANUP

Tenere il repo attuale ma fare una pulizia controllata.

Scegli CLEANUP se:

- la base funziona;
- Supabase/auth/test sono già preziosi;
- ci sono file legacy/duplicati ma isolabili;
- il routing è recuperabile;
- il cleanup costa meno del rebuild;
- la V1 può uscire più velocemente pulendo che rifacendo.

### REBUILD

Creare un nuovo progetto pulito.

Scegli REBUILD solo se:

- il repo attuale è troppo confuso;
- routing e stato sono fragili;
- localStorage/Supabase sono mischiati male;
- i file demo sono fusi con prodotto reale;
- ogni nuova feature rischia regressioni;
- Claude perde più tempo a capire che a costruire;
- il cleanup sarebbe quasi un rebuild mascherato.

---

## Matrice punteggi

Usa punteggio 1-5.

| Criterio | Peso | KEEP | CLEANUP | REBUILD | Come valutare |
|---|---:|---:|---:|---:|---|
| Velocità verso V1 vendibile | 5 | | | | Quanto rapidamente arriviamo a una demo client-grade stabile |
| Rischio regressioni | 5 | | | | Quanto è probabile rompere feature già funzionanti |
| Pulizia architetturale | 4 | | | | Quanto il progetto sarà leggibile tra 1 mese |
| Perdita lavoro già fatto | 5 | | | | Quanto lavoro utile perdiamo scegliendo questa strada |
| Facilità per Claude | 5 | | | | Quanto Claude può lavorare chirurgico senza leggere tutto |
| Stabilità Supabase/auth | 4 | | | | Quanto preserviamo integrazioni già funzionanti |
| Separazione Kitchen / TV / Experience | 3 | | | | Quanto i moduli sono separati e non si rompono a vicenda |
| Facilità onboarding nuovo locale | 4 | | | | Quanto la struttura aiuta a creare nuovo cliente/brand |
| Scalabilità V1.5 | 3 | | | | Quanto aiuta aggiungere payment/loyalty/live pulse dopo |
| Costo mentale per Eros | 4 | | | | Quanto è semplice continuare senza confusione |

---

## Interpretazione

### Se vince KEEP

Procedere con micro-sprint V1 direttamente.

Prima fase consigliata:

```text
V1 Productization Audit → Gap V1 → Prima microfase implementativa
```

### Se vince CLEANUP

Procedere con cleanup controllato, non refactor globale.

Prima fase consigliata:

```text
Repo Map → Archive legacy → Route map → File ownership → Build/test
```

### Se vince REBUILD

Non aprire subito il nuovo progetto.

Prima creare:

1. blueprint architettura;
2. lista file da copiare;
3. lista feature da lasciare fuori;
4. piano migrazione asset;
5. decisione Supabase: riuso o nuovo progetto.

---

## Regola finale

La scelta migliore non è quella “più pulita” in astratto.

La scelta migliore è quella che porta prima a:

```text
Walbox V1 vendibile, stabile, spiegabile a un locale reale.
```
