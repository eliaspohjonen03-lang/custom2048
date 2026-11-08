# Toteutusohje: 2048-peli GitHub Pagesiin

Tämä ohje on Claude Codelle. Tavoitteena on rakentaa 2048-peli GitHub-repoon ja julkaista se GitHub Pagesissa asennettavana verkkosovelluksena (PWA). Peli on tarkoitettu ensisijaisesti puhelimelle.

## 0. Lähtökohta

- Projektin juuressa on tiedosto `2048.html`. Se on **valmis ja testattu viitetoteutus**, jonka toiminta ja ulkoasu on jo hyväksytty. Käytä sitä pohjana äläkä kirjoita peliä alusta. Säilytä kaikki sen toiminnot, tekstit ja ulkoasu, ellei tämä ohje erikseen muuta niitä.
- Viitetoteutus tehtiin alun perin claude.ai:n artifact-sivuksi. Siinä on muutama sitä ympäristöä varten tehty kohta, jotka korvataan (ks. kohta 5).
- Käyttöliittymän kieli on suomi. Koodin kommentit saavat olla suomeksi tai englanniksi.
- Älä lisää mainoksia, analytiikkaa, kirjautumista, evästebannereita tai ulkoisia kirjastoja.

## 1. Tekniikka ja tiedostorakenne

Peli tehdään pelkällä HTML:llä, CSS:llä ja JavaScriptillä (ES-moduulit), ilman build-vaihetta ja ilman npm-riippuvuuksia ajonaikana. Testeihin saa käyttää Noden sisäänrakennettua `node:test`-moduulia.

```
/
├── index.html
├── css/style.css
├── js/
│   ├── main.js        käynnistys, syötteet, pelisilmukka
│   ├── logic.js       PUHDAS pelilogiikka (ei DOM-viittauksia), testattava Nodella
│   ├── render.js      laudan ja laattojen piirto, animaatiot
│   ├── storage.js     localStorage- ja IndexedDB-apurit
│   ├── stats.js       tilastot
│   ├── profiles.js    kuvasetit, vienti ja tuonti
│   ├── cropper.js     rajausikkuna
│   └── ui.js          modaalit, toast, asetukset- ja tilastot-ikkunat
├── manifest.webmanifest
├── sw.js
├── icons/             icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png (180×180)
├── tests/logic.test.js
├── .nojekyll
├── README.md
└── 2048.html          (viitetoteutus; poistetaan lopuksi tai siirretään kansioon reference/)
```

**Kaikki polut suhteellisia** (`./js/main.js`, `./sw.js`), koska Pages tarjoilee sivun osoitteessa `https://<käyttäjä>.github.io/<repo>/`.

## 2. Toiminnallinen määrittely

Viitetoteutus toteuttaa jo kaiken alla olevan. Lista on tässä tarkistuslistaksi.

### 2.1 Pelisäännöt
- Säännöt ovat samat kuin alkuperäisessä 2048:ssa. Uusi laatta on 2 todennäköisyydellä 90 % ja muuten 4.
- Laatta yhdistyy vain kerran per siirto. Yhdistyminen tapahtuu liikesuunnan reunasta alkaen: rivi `[2,2,2,2]` vasemmalle on `[4,4,0,0]`.
- Pisteitä saa yhdistetyn laatan arvon verran.
- Siirto lasketaan vain, jos jokin laatta liikkuu tai yhdistyy. Muuten mitään ei tapahdu.
- Peli ei pääty 2048:aan, vaan jatkuu niin pitkälle kuin pelaaja pystyy.

| Koko | Laattoja alussa | Uusia laattoja per siirto |
|------|-----------------|---------------------------|
| 4×4  | 2               | 1                         |
| 8×8  | 8               | 2                         |
| 16×16| 32              | 4                         |

Jos vapaita ruutuja on vähemmän kuin uusien laattojen määrä, niin moni kuin mahtuu.

### 2.2 Ruudukon koko
- Vaihtoehdot ovat 4×4, 8×8 ja 16×16, segmenttivalitsimena yläpalkissa.
- Koon vaihto aloittaa uuden pelin. Jos peli on kesken (siirtoja > 0 eikä peli ole päättynyt), näytetään ensin oma vahvistusikkuna. Selaimen `confirm()`-ikkunaa ei käytetä.
- Valittu koko muistetaan.
- Laudan rakoväli ja laattojen koko lasketaan laudan leveydestä ResizeObserverilla (CSS-muuttujat `--gap`, `--tpx` ja `--tr`). Numeron fonttikoko riippuu numeroiden määrästä.

### 2.3 Aika, siirrot ja peruutus
- Aikalaskuri käynnistyy ensimmäisestä siirrosta. Muoto on `m:ss`, ja tunnin jälkeen `h:mm:ss`.
- Aika pysähtyy, kun sivu ei ole näkyvissä (`visibilitychange`, `pagehide`), ja kun peli päättyy. Se jatkuu, kun sivu tulee taas näkyviin, tai kun pelaaja peruu siirron päättyneessä pelissä.
- Peruuta siirto -nappi toimii rajattomasti. Se palauttaa laudan, pisteet ja siirtomäärän, ja jokainen peruutus kasvattaa Peruutukset-laskuria yhdellä.
  - Muistissa historia on rajaton. Pysyvään tallennukseen tallennetaan viimeisimmät tilat noin 400 000 merkin rajaan asti.
  - Tilat tallennetaan merkkijonoina, joissa jokainen ruutu on log2-arvo base36-merkkinä.
- Peruutus onnistuu myös pelin päätyttyä, jolloin "Peli päättyi" -näkymä poistuu.
- Pikanäppäimet ovat Ctrl/Cmd+Z ja U. Peruuta-nappi on poissa käytöstä, kun historia on tyhjä.

### 2.4 Pelin loppu ja onnittelut
- Kun siirtoja ei ole, laudan päälle tulee näkymä: "Peli päättyi", pisteet, suurin laatta ja Uusi peli -nappi. Näkymä peittää vain laudan, joten Peruuta-nappi toimii edelleen.
- Ensimmäisellä kerralla kun 2048 saavutetaan, yläreunaan tulee noin 2,6 sekunnin toast "🎉 Mahtavaa, saavutit 2048! Peli jatkuu." Peli ei keskeydy.
- Jokaisesta uudesta suuremmasta tasosta (4096, 8192, …) tulee toast "🎉 Uusi taso: N!".
- Jos tasolle on asetettu kuva, toastissa näkyy pieni kuva.
- Peruutus ei nollaa onnittelua, eli sama taso ei onnittele uudelleen samassa pelissä.

### 2.5 Ohjaus
- Näppäimistöllä toimivat nuolinäppäimet ja WASD.
- Pyyhkäisy toimii Pointer Eventseillä laudalla. Kynnys on `max(18px, 4 % laudan leveydestä)`, ja yli 1,5 sekuntia kestäviä eleitä ei huomioida.
- Laudalla on `touch-action: none`, ja `touchmove` estetään (passive: false), jotta sivu ei vierity eikä pull-to-refresh käynnisty.
- Syötteitä ei käsitellä, kun jokin modaali on auki tai fokus on tekstikentässä.
- Nopeat peräkkäiset siirrot: kesken oleva animaatio viedään heti loppuun (`flush`) ennen seuraavaa. Mikään syöte ei saa hukkua eikä tila mennä ristiin.

### 2.6 Animaatiot
- Laatat liukuvat (`transform`-transitio, 100 ms), ja yhdistynyt laatta ilmestyy liu'un jälkeen.
- Uusi laatta ilmestyy lyhyellä häivytyksellä. Pomppuja, ääniä ja värinää ei ole.

### 2.7 Kuvasetit (profiilit)
- Oletuksena on "Tavalliset numerot". Käyttäjä voi luoda, nimetä uudelleen ja poistaa kuvasettejä (poisto vahvistetaan) ja vaihtaa aktiivisen setin Asetukset-ikkunan valikosta.
- Kuvapaikat ovat tasoille 2–8192 (13 kpl). Jos tasolla ei ole kuvaa, siinä näkyy numero ja normaali taustaväri.
- Laatoissa ei koskaan näytetä tekstimuotoisia nimiä, vain kuva tai numero.
- Asetuksissa on valinta "Näytä arvo kuvan kulmassa", oletuksena päällä. Merkki piilotetaan, jos laatta on alle 34 px.
- Kuvan vaihto päivittää laudan, evoluutiokaavion ja editorin heti, eikä peli keskeydy.

### 2.8 Kuvaeditori ja rajaus
- Jokaisella tasolla on rivi, jossa on esikatselu, arvo ja napit Laitteelta, Linkki, Rajaa ja ✕. Rajaa ja ✕ näkyvät vain, jos tasolla on kuva. Esikatselun napautus avaa rajauksen tai tiedostovalinnan.
- **Laitteelta:** tiedostovalinta `accept="image/*"`. Kuva pienennetään ensin enintään 1200 px:n alkuperäiseksi (JPEG 0,9, valkoinen tausta läpinäkyville kuville), sitten avautuu rajausikkuna.
- **Linkki:** URL-kenttä. Kuva haetaan asetuksella `crossOrigin="anonymous"`. Jos lataus epäonnistuu tai canvas on "tainted", näytetään selkeä suomenkielinen virheilmoitus ja neuvotaan käyttämään Laitteelta-nappia.
- **Rajausikkuna:**
  - neliön muotoinen esikatselu ja kolmasosaviivat
  - kuvan siirto vetämällä, zoomaus liukusäätimellä (1–6×), kahden sormen nipistyksellä ja hiiren rullalla
  - kierto 90° ja napit Peruuta ja Tallenna
  - kuva täyttää aina koko neliön (cover), eikä tyhjää reunaa pääse syntymään
- **Tallennus:** 256×256 JPEG (laatu 0,86) sekä rajausparametrit `{rot, zoom, x, y}`. Alkuperäinen kuva tallennetaan erikseen, jotta rajausta voi muuttaa myöhemmin.
- **"Lisää monta kuvaa kerralla":** valitut kuvat täyttävät tyhjät tasot pienimmästä alkaen keskitetyllä rajauksella.
- **Vie kuvasetti:** JSON-muoto `{app:"2048-kuvasetti", version:1, name, images:{"2":"data:image/jpeg;base64,…", …}}`. Napit ovat "Lataa tiedosto" (tavallinen `<a download>`) ja "Kopioi tekstinä" (`navigator.clipboard`).
- **Tuo kuvasetti:** tiedostosta tai liitetystä tekstistä. Jos samanniminen setti on jo olemassa, nimeen lisätään " (2)" ja niin edelleen.

### 2.9 Evoluutiokaavio
- Kaavio on laudan alla kortissa "Eteneminen", ja oikealla näkyy aktiivisen setin nimi.
- Siinä ovat tasot 2…max(8192, nykyinen suurin laatta).
- Tasot, joita ei ole vielä saavutettu, näkyvät himmeinä (opacity 0,32), ja nykyinen suurin laatta on kehystetty.
- Kuvatasojen alla näkyy pieni arvo. Numerotasoissa sitä ei toisteta.

### 2.10 Tilastot (localStorage, erikseen jokaiselle koolle)
- Kentät: `best`, `bestTile`, `games`, `wins`, `fast` (ms), `fewMoves` ja `fewUndos` (`{u, m, t, d}`).
- Peli lasketaan pelatuksi ensimmäisestä siirrosta.
- Kun 2048 saavutetaan ensimmäistä kertaa pelissä:
  - `wins` kasvaa yhdellä
  - `fast` ja `fewMoves` päivitetään, jos uusi tulos on parempi
  - `fewUndos` päivitetään, jos peruutuksia oli vähemmän; tasatilanteessa ratkaisee pienempi siirtomäärä.
- Tilastot-ikkunassa on kokovalitsin ja rivit Paras pistemäärä, Suurin saavutettu laatta, Nopein aika 2048:aan, Vähiten siirtoja 2048:aan, Vähiten peruutuksia 2048:aan (alla siirrot, aika ja päivämäärä), Pelatut pelit ja 2048 saavutettu (N kertaa).
- Jokaisella koolla on oma nollausnappi, ja nollaus vahvistetaan.
- Paras-laatikossa näkyy `max(tallennettu paras, nykyiset pisteet)`.

### 2.11 Tallennus
- Pelitila, tilastot, profiililista, aktiivinen profiili, arvomerkin asetus ja koko tallennetaan localStorageen (avaimen etuliite `g2048.`).
- Kuvat tallennetaan IndexedDB:hen (tietokanta `g2048-kuvat`, store `img`). Avaimet ovat `<profiiliId>:<arvo>` → `{data, crop}` ja `<profiiliId>:<arvo>:o` → alkuperäinen kuva.
- Jos IndexedDB ei ole käytettävissä, kuvat pidetään muistissa.
- Kaikki tallennuskutsut kääritään try/catchiin, eikä peli saa kaatua, vaikka tallennus epäonnistuisi.
- Käynnistyksessä kutsutaan `navigator.storage.persist()` (jos tuettu), jotta selain ei poista kuvia.
- Keskeneräinen peli palautuu, kun sivu avataan uudelleen. Virheellinen tallennus johtaa uuteen peliin eikä kaatumiseen.

### 2.12 Ulkoasu
- Vaalea, raikas ja pelkistetty. Värit, fontit (järjestelmäfontti), välit ja laattojen pastellipaletti otetaan viitetoteutuksen `PAL`-taulukosta ja CSS:stä.
- Laattojen kulmat ovat vain kevyesti pyöristetyt: 4/3/2 px koon mukaan.
- Kuvat täyttävät laatan (`background-size: cover`) eivätkä veny.
- Asettelu ylhäältä alas:
  1. otsikko, Pisteet ja Paras
  2. Aika, Siirrot ja Peruutukset
  3. koon valinta, Tilastot ja Asetukset
  4. lauta
  5. Peruuta siirto ja Uusi peli
  6. Eteneminen
  7. ohjeteksti
- Käytetään `env(safe-area-inset-*)`-täytteitä (lisää `viewport-fit=cover`), jotta lovelliset puhelimet toimivat asennettuna.
- Kaksoisnapautuszoomaus estetään (`touch-action: manipulation` napeissa).

## 3. PWA: asennettavuus ja offline-tila

- **`manifest.webmanifest`:**
  - `name` ja `short_name` "2048"
  - `start_url` ja `scope` "./"
  - `display` "standalone", `orientation` "portrait"
  - `background_color` ja `theme_color` `#f4f6f9`
  - ikonit 192, 512 ja maskable 512
- **Ikonit:** kultainen tausta `#ffe6a3` ja teksti "2048" värillä `#7a5200` (sama kuin 2048-laatassa). Generoi PNG:t skriptillä, esim. Pythonilla ja Pillowlla, ja commitoi ne. Lisää `apple-touch-icon` ja favicon.
- **`sw.js`:**
  - Välimuistin nimessä on versio (esim. `2048-v1`). Install-vaiheessa välimuistiin haetaan kaikki sovelluksen tiedostot.
  - Activate-vaihe poistaa vanhat välimuistit.
  - Fetch-käsittely toimii samaan originiin cache-first-periaatteella ja navigoinneille network-first-periaatteella, varalla `index.html`.
  - Vieraiden originien pyyntöihin (linkkikuvat) ei puututa.
- **Päivitys:** kun uusi service worker on asentunut ja odottaa, näytetään toast tai pieni palkki "Uusi versio saatavilla – Päivitä". Napautus lähettää viestin `SKIP_WAITING` ja lataa sivun uudelleen.
- Service worker rekisteröidään vain, kun sivu on `https:`- tai `localhost`-osoitteessa.
- **Versiointi:** cache-versio nostetaan jokaisessa julkaisussa. Mainitse tämä README:ssä.

## 4. Testit

- **`tests/logic.test.js`** (`node --test`) testaa vähintään nämä:
  - yhdistyminen kaikkiin neljään suuntaan
  - `[2,2,2,2]` → `[4,4,0,0]`
  - `[4,0,4,8]` vasemmalle → `[8,8,0,0]`
  - ettei laatta yhdisty kahdesti
  - `moved = false`, kun mikään ei liiku
  - pisteiden laskenta
  - `canMove`
  - encode ja decode
  - laattojen ilmestyminen täyteen tai melkein täyteen lautaan
- `logic.js`:n pitää olla puhdas: ei DOMia, ja satunnaisuus annetaan parametrina, jotta testit ovat toistettavia.
- Jos Playwright on saatavilla, tee lisäksi savutesti mobiilinäkymässä (390×844):
  - näppäinsiirrot ja pyyhkäisyt
  - peruutus
  - uudelleenlataus säilyttää pelin
  - koon vaihto vahvistusikkunan kautta
  - pelin päättyminen ja peruutus sen jälkeen
  - kuvasetin luonti, kuvan lisäys laitteelta ja rajaus
  - tilastot-ikkuna
  - ei konsolivirheitä
- Ota kuvakaappaukset 4×4-, 8×8- ja 16×16-laudoista ja tarkista ne itse.

## 5. Muutokset viitetoteutukseen

1. Poista `window.claude.use('downloads')` -haara viennistä ja käytä pelkkää `<a download>` -latausta.
2. Poista blob-URL:llä ajon aikana luotu manifest ja canvasilla piirretyt ikonit. Tilalle tulevat oikeat tiedostot (kohta 3).
3. Jaa koodi moduuleihin kohdan 1 mukaisesti niin, ettei toiminta muutu.
4. Lisää `navigator.storage.persist()`, service worker, päivitysilmoitus ja safe-area-täytteet.
5. Muuta mahdolliset absoluuttiset polut suhteellisiksi.

## 6. GitHub ja julkaisu

1. Luo repo (esim. `2048`) käyttäjän tilille: `gh repo create 2048 --public --source=. --push`. Jos `gh` ei ole kirjautunut, pyydä käyttäjää ajamaan `gh auth login`.
2. Ota GitHub Pages käyttöön GitHub Actionsilla:
   - Lisää `.github/workflows/pages.yml`. Se ajaa testit (`node --test`) ja julkaisee repon juuren toiminnoilla `actions/configure-pages`, `actions/upload-pages-artifact` ja `actions/deploy-pages`. Laukaisu tapahtuu pushista `main`-haaraan.
   - Aseta Pages-lähteeksi "GitHub Actions" komennolla `gh api -X POST repos/{owner}/{repo}/pages -f build_type=workflow`. Jos se ei onnistu, neuvo käyttäjää: Settings → Pages → Source: GitHub Actions.
3. Odota, että workflow menee läpi (`gh run watch`), ja tarkista, että sivu aukeaa osoitteessa `https://<käyttäjä>.github.io/2048/`.
4. Tee pienet ja selkeät commitit vaiheittain, esim.:
   1. projektin rakenne ja viitetoteutuksen jako moduuleihin
   2. logiikan testit
   3. PWA
   4. Pages-workflow
   5. README

## 7. README.md (suomeksi)

- Lyhyt kuvaus ja linkki peliin.
- Asennus kotinäytölle:
  - **iPhone:** Safari → Jaa → Lisää Koti-valikkoon
  - **Android:** Chrome → ⋮ → Asenna sovellus / Lisää aloitusnäyttöön
- Miten kuvasetit toimivat. Kuvat ovat vain kyseisellä laitteella, ja ne siirretään viennillä ja tuonnilla.
- Kehittäjälle: miten paikallinen palvelin käynnistetään (`python3 -m http.server`), miten testit ajetaan ja että cache-versio nostetaan `sw.js`:ssä julkaisun yhteydessä.

## 8. Hyväksymiskriteerit

- [ ] Kaikki kohdan 2 toiminnot toimivat puhelimessa (iOS Safari ja Android Chrome) sekä tietokoneella.
- [ ] Pyyhkäisy ei vieritä sivua eikä käynnistä päivitystä vetämällä.
- [ ] Nopea syöte ei riko lautaa: DOM-laattojen määrä on sama kuin tilan laattojen määrä animaatioiden jälkeen.
- [ ] Peli toimii ilman nettiä, kun se on kerran avattu, ja on asennettavissa kotinäytölle.
- [ ] Sivu ja kuvasetit säilyvät uudelleenlatauksen ja sovelluksen sulkemisen yli.
- [ ] Ei konsolivirheitä, eikä ulkoisia pyyntöjä käyttäjän linkkikuvia lukuun ottamatta.
- [ ] `node --test` menee läpi, ja Pages-workflow on vihreä.
- [ ] Lopuksi kerro käyttäjälle julkaistun pelin osoite.
