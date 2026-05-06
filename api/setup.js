/**
 * Engangs-oppsett: Opprett første admin-bruker.
 * Fungerer KUN hvis ingen fbs_user:* nøkler finnes i Redis.
 * Blokkeres automatisk etter at første bruker er opprettet.
 */
import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

function validatePassword(pw) {
  if (!pw || pw.length < 8) return 'Passordet må ha minst 8 tegn.';
  if (!/[A-Z]/.test(pw)) return 'Passordet må ha minst én stor bokstav.';
  if (!/[0-9]/.test(pw)) return 'Passordet må ha minst ett tall.';
  if (!/[!@#$%^&*()\-_=+{};:,<.>?/|[\]\\~`"']/.test(pw)) return 'Passordet må ha minst ett spesialtegn (f.eks. ! @ # $).';
  return null;
}

export default async function handler(req, res) {
  // Kun GET (vis skjema) og POST (opprett bruker)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Sjekk om det allerede finnes brukere
  const existingKeys = await redis.keys('fbs_user:*');
  const alreadySetUp = existingKeys.length > 0;

  if (req.method === 'GET') {
    const html = alreadySetUp
      ? `<!DOCTYPE html><html lang="no"><head><meta charset="UTF-8"><title>FBS Oppsett</title>
         <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f1f5f9}
         .card{background:white;padding:40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);max-width:420px;text-align:center}
         .logo{background:#1e3a5f;color:white;width:64px;height:64px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;margin:0 auto 16px}
         </style></head><body>
         <div class="card"><div class="logo">FBS</div>
         <h2 style="color:#16a34a">✅ Oppsett fullført</h2>
         <p>Det finnes allerede brukere i systemet. Gå til <a href="/">innloggingssiden</a>.</p>
         </div></body></html>`
      : `<!DOCTYPE html><html lang="no"><head><meta charset="UTF-8"><title>FBS – Første oppsett</title>
         <style>
           *{box-sizing:border-box}
           body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a}
           .card{background:white;padding:40px;border-radius:16px;box-shadow:0 4px 32px rgba(0,0,0,.3);max-width:440px;width:100%;margin:16px}
           .logo{background:#1e3a5f;color:white;width:64px;height:64px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;margin:0 auto 16px}
           h1{text-align:center;font-size:22px;color:#1e293b;margin:0 0 4px}
           .sub{text-align:center;color:#64748b;font-size:13px;margin-bottom:28px}
           label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}
           input{width:100%;padding:12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:15px;outline:none;transition:border .15s}
           input:focus{border-color:#1e3a5f}
           .field{margin-bottom:16px}
           .btn{width:100%;padding:14px;background:#f59e0b;color:#1e293b;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;margin-top:8px;transition:background .15s}
           .btn:hover{background:#d97706}
           .btn:disabled{opacity:.6;cursor:not-allowed}
           .error{background:#fee2e2;color:#991b1b;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px;display:none}
           .info{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;padding:12px 14px;border-radius:8px;font-size:13px;margin-bottom:20px}
           .rules{font-size:12px;color:#6b7280;margin-top:6px;padding-left:16px;line-height:1.8}
           .success{background:#dcfce7;color:#166534;padding:20px;border-radius:8px;text-align:center;display:none}
         </style></head><body>
         <div class="card">
           <div class="logo">FBS</div>
           <h1>FolloByggService</h1>
           <p class="sub">Første gangs oppsett – opprett admin-konto</p>
           <div class="info">⚠️ Denne siden er kun tilgjengelig før første bruker er opprettet. Etter dette blokkeres den automatisk.</div>
           <div class="error" id="err"></div>
           <div id="form">
             <div class="field"><label>Navn</label><input id="navn" type="text" placeholder="Fornavn Etternavn" autocomplete="name"></div>
             <div class="field"><label>E-postadresse</label><input id="email" type="email" placeholder="din@epost.no" autocomplete="email"></div>
             <div class="field">
               <label>Passord</label>
               <input id="pw" type="password" placeholder="Velg et sterkt passord" autocomplete="new-password">
               <ul class="rules">
                 <li>Minst 8 tegn</li><li>Minst én stor bokstav (A–Z)</li>
                 <li>Minst ett tall (0–9)</li><li>Minst ett spesialtegn (! @ # $ …)</li>
               </ul>
             </div>
             <div class="field"><label>Bekreft passord</label><input id="pw2" type="password" placeholder="Gjenta passord" autocomplete="new-password"></div>
             <button class="btn" id="btn" onclick="doSetup()">Opprett admin-konto</button>
           </div>
           <div class="success" id="ok">
             <div style="font-size:48px">✅</div>
             <h2 style="margin:8px 0">Konto opprettet!</h2>
             <p>Du kan nå <a href="/">logge inn</a> med din e-post og passord.</p>
           </div>
         </div>
         <script>
           async function doSetup() {
             const navn=document.getElementById('navn').value.trim();
             const email=document.getElementById('email').value.trim();
             const pw=document.getElementById('pw').value;
             const pw2=document.getElementById('pw2').value;
             const err=document.getElementById('err');
             err.style.display='none';
             if(!navn||!email||!pw){err.textContent='Fyll inn alle felter.';err.style.display='block';return;}
             if(pw!==pw2){err.textContent='Passordene er ikke like.';err.style.display='block';return;}
             document.getElementById('btn').disabled=true;
             document.getElementById('btn').textContent='Oppretter…';
             const res=await fetch('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({navn,email,password:pw})});
             const data=await res.json();
             if(res.ok){document.getElementById('form').style.display='none';document.getElementById('ok').style.display='block';}
             else{err.textContent=data.error||'Noe gikk galt.';err.style.display='block';document.getElementById('btn').disabled=false;document.getElementById('btn').textContent='Opprett admin-konto';}
           }
           document.addEventListener('keydown',e=>{if(e.key==='Enter')doSetup();});
         </script>
         </body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }

  // POST: Opprett admin-bruker
  if (alreadySetUp) {
    return res.status(403).json({ error: 'Oppsett er allerede fullført. Bruk innloggingssiden.' });
  }

  let body = req.body;
  if (typeof body === 'string') try { body = JSON.parse(body); } catch { body = {}; }
  const { email, password, navn } = body || {};

  if (!email || !password || !navn) {
    return res.status(400).json({ error: 'Navn, e-post og passord er påkrevd.' });
  }

  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const emailKey = email.trim().toLowerCase();
  const hash = await bcrypt.hash(password, 12);

  await redis.set(`fbs_user:${emailKey}`, {
    email: emailKey,
    passwordHash: hash,
    role: 'admin',
    ansattId: null,
    navn: navn.trim(),
    active: true,
    createdAt: Date.now(),
  });

  return res.status(200).json({ ok: true });
}
