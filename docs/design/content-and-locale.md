# Content and locale

## Voice

Plain, specific and factual. The interface states what a number is, where it came from and what it
does not mean. It never sells, never hedges and never speaks in the first person.

- A button names its action: "Show 212 properties", "Reprocess 212 snapshots", "Cancel this run".
- An error names the problem and the way out: "Below the lowest in Pinheiros, R$ 9,870. Enter
  9,870 or more."
- An empty state explains why it is empty and offers a next step.
- A limit is stated before it is reached: slots in use, questions left today.

## Terminology

| Term               | Meaning in the interface                                        | Never call it          |
| ------------------ | --------------------------------------------------------------- | ---------------------- |
| Property           | One physical property; a row in every list                      | Listing, ad            |
| Listing            | One advertisement of a property on one source                   | Property               |
| Asking price       | The price on a listing                                          | Price, value, sold for |
| Sale price         | A recorded transaction price; absent unless a source reports it | Asking price           |
| Time on market     | Days from first seen to today, or to removal                    | Age                    |
| Returned to market | A listing that was removed and seen again                       | New listing            |
| Comparable         | A property selected by the stated criteria                      | Similar, recommended   |
| Run                | One execution of a natural-language question                    | Chat, message          |
| Waiting for you    | The public state `awaiting_confirmation`                        | Pending, paused        |
| Degraded mode      | The rule-based classifier is deciding                           | Offline, fallback      |
| Explanation        | Text a model wrote about a computed figure                      | Answer, insight        |
| Synthetic data     | Fixture data; shown with a dashed tag                           | Sample, demo           |

## Languages

Screens are authored in Brazilian Portuguese, the primary and default locale. English is the
second locale, reached through the switch in the shell. `PlaceEN.dc.html` shows one screen in
English.

The repository itself stays in English: code, identifiers, comments and documentation. Only the
copy a user reads is written in Portuguese first.

| English                    | Brazilian Portuguese           |
| -------------------------- | ------------------------------ |
| Places                     | Lugares                        |
| Search                     | Buscar                         |
| Ask                        | Perguntar                      |
| Market                     | Mercado                        |
| More                       | Mais                           |
| Asking                     | Pedido                         |
| Sale                       | Venda                          |
| Property / properties      | Imóvel / imóveis               |
| Listing / listings         | Anúncio / anúncios             |
| Median asking price per m² | Mediana do preço pedido por m² |
| Time on market             | Tempo de anúncio               |
| Synthetic data             | Dados sintéticos               |

Rules for both locales:

- Place names, street names and source names are never translated.
- Labels may wrap to two lines. No label is truncated with an ellipsis.
- The plate name wraps and stays balanced; it is never shrunk to fit.
- Tab labels are single words in both languages.

## Numbers, money and dates

| Kind         | English             | Brazilian Portuguese |
| ------------ | ------------------- | -------------------- |
| Money        | `R$ 785,000`        | `R$ 785.000`         |
| Price per m² | `R$ 11,544/m²`      | `R$ 11.544/m²`       |
| Exact result | `R$ 11,544.12/m²`   | `R$ 11.544,12/m²`    |
| Percentage   | `+3.1%`, `−0.8%`    | `+3,1%`, `−0,8%`     |
| Date         | `9 Oct 2026, 06:00` | `9 out. 2026, 06:00` |
| Probability  | `0.91`              | `0,91`               |
| Number range | `1200 – 1298`       | `1200 – 1298`        |

- The currency is always BRL. No conversion is implied in either locale.
- A negative value uses the minus sign `−`, not a hyphen.
- A movement carries its sign or a word ("7.5% below median"); colour alone never carries it.
- Aggregates round to whole reais; a single computed result keeps two decimals.
- Formatting belongs to the frontend through `Intl.NumberFormat` and `Intl.DateTimeFormat`. The
  values themselves come from the backend.
