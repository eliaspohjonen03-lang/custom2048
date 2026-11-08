# 2048 – omilla kuvilla

Klassinen 2048-peli puhelimelle ja tietokoneelle. Laudan koko voi olla 4×4, 8×8 tai 16×16. Numeroiden tilalle voi vaihtaa omia kuvia, esim. perheenjäsenet tai automerkit. Peli on asennettava verkkosovellus (PWA), joten se toimii myös ilman nettiä, kun se on kerran avattu.

**▶ Pelaa: https://eliaspohjonen03-lang.github.io/custom2048/**

- Pelaa pyyhkäisemällä laudalla, nuolinäppäimillä tai WASD-näppäimillä.
- Peruuta siirto -napilla (Ctrl/Cmd+Z tai U) voi perua rajattomasti, myös pelin päätyttyä.
- Peli ei pääty 2048:aan, vaan jatkuu niin pitkälle kuin pystyt.
- Tilastot pidetään erikseen jokaiselle koolle: paras pistemäärä, nopein aika 2048:aan, vähiten siirtoja ja peruutuksia.

## Asennus kotinäytölle

- **iPhone / iPad:** avaa peli Safarissa → Jaa-painike → **Lisää Koti-valikkoon**.
- **Android:** avaa peli Chromessa → ⋮-valikko → **Asenna sovellus** tai **Lisää aloitusnäyttöön**.

Asennettu peli aukeaa koko näytölle omana sovelluksenaan ja toimii ilman verkkoyhteyttä. Kun peliin tulee uusi versio, näytön alareunaan ilmestyy ilmoitus "Uusi versio saatavilla" ja **Päivitä**-nappi.

## Kuvasetit

1. Avaa **Asetukset** (rataskuvake) ja valitse **+ Uusi kuvasetti**.
2. Lisää jokaiselle tasolle (2–8192) kuva: **Laitteelta** (kuvagalleria tai kamera) tai **Linkki** (suora linkki kuvatiedostoon). **Lisää monta kuvaa kerralla** täyttää tyhjät tasot pienimmästä alkaen.
3. Rajausikkunassa kuvaa voi siirtää vetämällä, zoomata kahdella sormella tai liukusäätimellä ja kiertää 90°. Rajausta voi muuttaa myöhemmin napauttamalla kuvaa.

Tasoilla, joilla ei ole kuvaa, näkyy tavallinen numero. Kuvasettejä voi olla useita, ja niiden välillä vaihdetaan Asetuksista.

**Kuvat tallentuvat vain sille laitteelle ja selaimelle, jolla ne lisättiin.** Toiselle laitteelle tai kaverille ne siirretään näin: **Vie kuvasetti** (tiedostona tai leikepöydälle tekstinä) ja toisella laitteella **Tuo kuvasetti**.

Linkkikuvissa jotkin sivustot eivät salli kuvan käyttöä toisella sivulla. Tallenna silloin kuva ensin laitteelle ja valitse se Laitteelta-napilla.

## Kehittäjälle

Peli on tehty pelkällä HTML:llä, CSS:llä ja JavaScriptillä (ES-moduulit). Siinä ei ole build-vaihetta eikä riippuvuuksia.

```
index.html             sivun runko
css/style.css          tyylit
js/main.js             käynnistys, syötteet, pelisilmukka, service workerin rekisteröinti
js/logic.js            puhdas pelilogiikka (ei DOMia, satunnaisuus parametrina)
js/render.js           laudan ja laattojen piirto, animaatiot
js/storage.js          localStorage- ja IndexedDB-apurit
js/stats.js            tilastot
js/profiles.js         kuvasetit, vienti ja tuonti
js/cropper.js          kuvan käsittely ja rajausikkuna
js/ui.js               modaalit, toast, asetukset- ja tilastot-ikkunat
js/dom.js              pienet DOM-apurit
sw.js                  service worker (offline-välimuisti)
manifest.webmanifest   PWA-manifest
icons/                 ikonit (generoidaan: python3 scripts/make_icons.py)
tests/                 testit
reference/2048.html    alkuperäinen yhden tiedoston viitetoteutus
```

### Paikallinen palvelin

```sh
python3 -m http.server 8000
# avaa http://localhost:8000/
```

Moduulit ja service worker eivät toimi `file://`-osoitteesta, joten käytä paikallista palvelinta. Service worker rekisteröidään vain `https:`- ja `localhost`-osoitteissa. Kehityksen aikana kannattaa selaimen kehittäjätyökaluissa valita *Application → Service workers → Update on reload*, jotta välimuisti ei näytä vanhaa versiota.

### Testit

```sh
node --test                    # pelilogiikan yksikkötestit (Node 18+)
node tests/smoke.e2e.mjs       # savutesti mobiilinäkymässä (vaatii Playwrightin ja Chromiumin)
SHOTS=./kuvat node tests/smoke.e2e.mjs   # sama + kuvakaappaukset kansioon ./kuvat
```

### Julkaisu

Push `main`-haaraan ajaa GitHub Actions -workflow'n (`.github/workflows/pages.yml`). Se ajaa testit ja julkaisee repon juuren GitHub Pagesiin. Pages-lähteeksi pitää olla valittuna **Settings → Pages → Source: GitHub Actions**.

> **Tärkeää:** nosta välimuistin versiota `sw.js`:ssä (`const CACHE = '2048-v1'` → `'2048-v2'` jne.) jokaisessa julkaisussa. Muuten asennetut sovellukset eivät saa uusia tiedostoja. Jos lisäät uuden tiedoston, lisää se myös `sw.js`:n `ASSETS`-listaan.

### Tallennus

- localStorage (etuliite `g2048.`): pelitila ja peruutushistoria, tilastot, kuvasettien lista, aktiivinen setti, asetukset ja koko.
- IndexedDB (`g2048-kuvat`, store `img`): `<setti>:<arvo>` → `{data, crop}` ja `<setti>:<arvo>:o` → alkuperäinen kuva.
