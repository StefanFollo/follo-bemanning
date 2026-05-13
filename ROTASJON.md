# Rotasjon av INTER_APP_TOKEN

Tokenet som lar Tilbuds-appen og Bemanningsplanleggeren snakke sammen
**skal roteres hver 6. måned**. Sett en kalenderpåminnelse i Stefan og
Katerynas kalender.

## Når skal det roteres?

- **Plan: hver 6. måned** (f.eks. 1. mai og 1. november)
- **Umiddelbart** hvis det er mistanke om at tokenet er lekket (vist i chatlogger,
  delt utenfor teamet, sett av uvedkommende, etc.)

## Rotasjonsprosedyre (5 minutter)

1. **Generér nytt token** (64 hex-tegn)

   I terminal eller via online generator:
   ```bash
   openssl rand -hex 32
   ```
   Eller spør Claude: *"Generer et nytt 64-tegns hex-token"*

2. **Oppdater i begge Vercel-prosjekter** (samme token i begge!)

   - Vercel → `follo-befaring` → Settings → Environment Variables
   - Finn `INTER_APP_TOKEN` → klikk redigér (...) → lim inn ny verdi → Save
   - Vercel → `follo-bemanning` → samme prosedyre, samme verdi

3. **Redeploy begge appene**

   - Vercel → hver app → Deployments → øverste rad → ⋮ → Redeploy
   - Vent ~1 minutt per app

4. **Test at integrasjonen virker** (etter begge er redeployet)

   - Åpne tilbuds-appen → klikk **📥 Hent fra planlagt befaring**
   - Listen skal lastes uten feil
   - Hvis du ser "Ugyldig inter-app-token": tokenet er forskjellig i de to appene

## Hva som skjer hvis tokenet lekker

Det gamle tokenet slutter å virke så snart du har endret det i begge apper og
redeployet. Det finnes ingen tilbakefall — gamle systemer som prøver å bruke
det gamle tokenet får 401 Unauthorized.

Hvis du mister tokenet og glemmer å oppdatere det noensteds: bare generér nytt
og oppdater begge apper. Det er ingen "låst tilstand" — du kan rotere ofte
uten å skade noe.

## Sjekkliste for hver rotasjon

- [ ] Generert nytt token
- [ ] Oppdatert i follo-befaring (Vercel)
- [ ] Oppdatert i follo-bemanning (Vercel) — samme verdi
- [ ] Redeployet follo-befaring
- [ ] Redeployet follo-bemanning
- [ ] Testet: 📥 Hent fra planlagt befaring viser liste
- [ ] Skrevet ny rotasjonsdato i kalenderen (+6 måneder)
