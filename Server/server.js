require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Cemetery = require('./Models/Cemetery');
const Deceased = require('./Models/Deceased');
const Employees = require('./Models/Employees');
const Municipalities = require('./Models/Municipalities');
const Tombstones = require('./Models/Tombstones');
const Users = require('./Models/Users');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // ✅ limit per le foto base64

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connesso a MongoDB'))
  .catch(err => console.error('❌ Errore MongoDB:', err));

app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Configure nodemailer transporter (set SMTP_* env vars)
const smtpUser = (process.env.SMTP_USER || process.env.SMTP_USER1 || process.env.SMTP_USER2 || '').trim();
const smtpPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : undefined;
let mailTransporter = null;
if (process.env.SMTP_HOST && smtpUser && smtpPass) {
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  console.log('SMTP transporter configured with host:', process.env.SMTP_HOST, 'port:', process.env.SMTP_PORT, 'secure:', process.env.SMTP_SECURE, 'user:', smtpUser);

  mailTransporter.verify((error, success) => {
    if (error) {
      console.error('SMTP verification failed:', error);
    } else {
      console.log('✅ SMTP configurato correttamente. Email pronte per l’invio.');
    }
  });
} else {
  console.warn('SMTP non configurato. Email sending disabled. Set SMTP_HOST and SMTP_USER or SMTP_USER1 in .env');
}

async function sendMail(options) {
  if (!mailTransporter) {
    throw new Error('SMTP non configurato. Imposta SMTP_HOST e SMTP_USER nel file .env.');
  }

  const authFrom = smtpUser || process.env.SMTP_USER || process.env.SMTP_USER1 || process.env.SMTP_USER2 || process.env.FROM_EMAIL || 'no-reply@example.com';
  const mailOptions = {
    ...options,
    from: authFrom,
    replyTo: options.replyTo || options.from || process.env.FROM_EMAIL || authFrom
  };

  console.log('Invio email:', {
    from: mailOptions.from,
    to: mailOptions.to,
    subject: mailOptions.subject,
    hasHtml: !!mailOptions.html
  });

  try {
    const info = await mailTransporter.sendMail(mailOptions);
    console.log('Email inviata:', info.messageId);
    return info;
  } catch (err) {
    console.error('Errore invio email:', err);
    throw err;
  }
}

// ════════════════════════════════════════════════════════
//  DEBUG / AUTH
// ════════════════════════════════════════════════════════
app.get('/api/debug/smtp', async (req, res) => {
  try {
    if (!mailTransporter) {
      return res.status(500).json({ ok: false, message: 'SMTP non configurato' });
    }

    mailTransporter.verify((err, success) => {
      if (err) {
        return res.status(500).json({ ok: false, message: 'Verifica SMTP fallita', error: err.message });
      }
      res.json({ ok: true, message: 'SMTP configurato correttamente', user: smtpUser, host: process.env.SMTP_HOST, port: process.env.SMTP_PORT });
    });
  } catch (err) {
    console.error('Errore debug SMTP:', err);
    res.status(500).json({ ok: false, message: 'Errore interno debug SMTP' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(401).json({ message: 'Email o password non validi' });

    const normalizedEmail = email.trim().toLowerCase();
    const emailQuery = { email: { $regex: `^${normalizedEmail}$`, $options: 'i' } };
    let authUser = null;

    const employee = await Employees.findOne(emailQuery);
    if (employee) {
      const valid = await bcrypt.compare(password, employee.passwordHash || '');
      if (valid) {
        authUser = {
          role: 'employee',
          fullName: employee.fullName,
          email: employee.email,
          employeeId: employee._id,
          municipalityId: employee.municipalityId,
        };
      }
    }

    let user = null;
    if (!authUser) {
      user = await Users.findOne(emailQuery);

      const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
      if (user) {
        if (requireVerification && !user.emailVerified)
          return res.status(403).json({ message: 'Email non verificata. Controlla la tua casella di posta e conferma l\'autenticazione account.' });

        const valid = await bcrypt.compare(password, user.passwordHash || '');
        if (valid) {
          authUser = {
            role: 'user',
            username: user.fullName,
            email: user.email,
            userId: user._id,
            municipalityId: user.municipalityId,
            assignedDeceased: user.assignedDeceased || [],
          };
        }
      }
    }

    const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
    if (requireVerification && user && !user.emailVerified)
      return res.status(403).json({ message: 'Email non verificata. Controlla la tua casella di posta e conferma l\'autenticazione account.' });

    if (!authUser)
      return res.status(401).json({ message: 'Email o password non validi' });

    res.json(authUser);
  } catch (err) {
    console.error('Errore login:', err);
    res.status(500).json({ message: 'Errore interno durante il login' });
  }
});

app.post('/api/users/register', async (req, res) => {
  try {
    const { username, fullName, email, password, municipalityId, createdBy } = req.body;
    if (!username || !fullName || !email || !password)
      return res.status(400).json({ message: 'Dati di registrazione incompleti' });

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await Users.findOne({ email: { $regex: `^${normalizedEmail}$`, $options: 'i' } });
    if (existing)
      return res.status(409).json({ message: 'Impossibile completare la registrazione' });

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(24).toString('hex');
    const user = new Users({
      username: username.trim(),
      fullName: fullName.trim(),
      email: normalizedEmail,
      passwordHash,
      municipalityId: municipalityId || null,
      createdBy: createdBy || 'SELF',
      emailVerified: false,
      verificationToken,
      assignedDeceased: []
    });

    const saved = await user.save();
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/verify-email/${verificationToken}`;
    let emailSent = true;

    try {
      await sendMail({
        to: saved.email,
        subject: 'Conferma la tua registrazione a RememberMe',
        text: `Ciao ${saved.fullName},\n\nGrazie per esserti registrato su RememberMe. Per completare la registrazione del tuo account, copia e incolla il link qui sotto nel tuo browser:\n\n${verificationUrl}\n\nSe non hai richiesto questa registrazione, ignora questa email.\n\nCordiali saluti,\nTeam RememberMe`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
            <h2 style="color: #0b3d91;">Benvenuto su RememberMe, ${saved.fullName}!</h2>
            <p>Grazie per esserti registrato. Per completare l’attivazione del tuo account, clicca sul pulsante qui sotto:</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="text-decoration: none; background: #0b3d91; color: #ffffff; padding: 14px 24px; border-radius: 8px; display: inline-block;">
                Verifica il tuo account
              </a>
            </p>
            <p>In alternativa, copia e incolla il seguente link nel tuo browser:</p>
            <p style="word-break: break-all; color: #404040;">${verificationUrl}</p>
            <p>Se non hai richiesto questa registrazione, ignora semplicemente questa email.</p>
            <p>Cordiali saluti,<br><strong>Team RememberMe</strong></p>
          </div>
        `
      });
    } catch (err) {
      emailSent = false;
      console.error('Errore invio autenticazione email:', err);
    }

    res.status(201).json({
      _id: saved._id,
      username: saved.username,
      fullName: saved.fullName,
      email: saved.email,
      municipalityId: saved.municipalityId,
      emailSent,
      message: emailSent
        ? 'Registrazione completata. Controlla la posta per confermare il tuo account.'
        : 'Registrazione completata. Impossibile inviare la mail di verifica, prova a reinviare il link dalla pagina di verifica.'
    });
  } catch (err) {
    console.error('Errore registrazione:', err);
    res.status(500).json({ message: 'Errore interno durante la registrazione' });
  }
});

// Endpoint per password dimenticata: invia una mail con istruzioni
app.get('/api/users/verify/:token', async (req, res) => {
  try {
    const token = req.params.token;
    if (!token) return res.status(400).json({ message: 'Token di verifica mancante' });

    const user = await Users.findOne({ verificationToken: token });
    if (!user) return res.status(400).json({ message: 'Token non valido o scaduto' });

    user.emailVerified = true;
    user.verificationToken = null;
    await user.save();

    res.json({ message: 'Email verificata con successo. Ora puoi accedere.' });
  } catch (err) {
    console.error('Errore verifica email:', err);
    res.status(500).json({ message: 'Errore interno durante la verifica' });
  }
});

app.post('/api/users/resend-verification', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email richiesta' });

    const user = await Users.findOne({ email: { $regex: `^${email}$`, $options: 'i' } });
    if (user && !user.emailVerified) {
      const verificationToken = crypto.randomBytes(24).toString('hex');
      user.verificationToken = verificationToken;
      await user.save();

      const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/verify-email/${verificationToken}`;
      await sendMail({
        to: user.email,
        subject: 'Reinvio link di verifica RememberMe',
        text: `Ciao ${user.fullName || user.username},\n\nHai richiesto il reinvio del link di verifica. Per attivare il tuo account, copia e incolla il seguente link nel browser:\n\n${verificationUrl}\n\nSe non hai richiesto questa operazione, ignora questa email.\n\nCordiali saluti,\nTeam RememberMe`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
            <h2 style="color: #0b3d91;">Reinvio link di verifica</h2>
            <p>Ciao ${user.fullName || user.username},</p>
            <p>Hai richiesto di ricevere nuovamente il link per verificare il tuo account RememberMe.</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="text-decoration: none; background: #0b3d91; color: #ffffff; padding: 14px 24px; border-radius: 8px; display: inline-block;">
                Verifica il tuo account</a>
            </p>
            <p>In alternativa copia e incolla il link di seguito nel browser:</p>
            <p style="word-break: break-all; color: #404040;">${verificationUrl}</p>
            <p>Se non hai richiesto questa operazione, ignora questa email.</p>
            <p>Cordiali saluti,<br><strong>Team RememberMe</strong></p>
          </div>
        `
      });
    }

    res.json({ message: 'Se l\'email è registrata e non ancora verificata, il link di verifica è stato reinviato.' });
  } catch (err) {
    console.error('Errore reinvio email verifica:', err);
    res.status(500).json({ message: 'Errore interno' });
  }
});

app.post('/api/users/forgot', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email richiesta' });

    // For privacy, respond ok regardless; attempt to send email if user exists
    const user = await Users.findOne({ email: { $regex: `^${email}$`, $options: 'i' } });
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/reset-password`;

    if (user) {
      sendMail({
        to: user.email,
        subject: 'Recupero password RememberMe',
        text: `Ciao ${user.fullName || user.username},\n\nHai richiesto il recupero della password. Per reimpostarla, copia e incolla il seguente link nel browser:\n\n${resetLink}\n\nSe non hai richiesto questa operazione, ignora questa email.\n\nCordiali saluti,\nTeam RememberMe`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
            <h2 style="color: #0b3d91;">Recupero password RememberMe</h2>
            <p>Ciao ${user.fullName || user.username},</p>
            <p>Hai richiesto di ripristinare la tua password. Usa il pulsante qui sotto per iniziare:</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="text-decoration: none; background: #0b3d91; color: #ffffff; padding: 14px 24px; border-radius: 8px; display: inline-block;">
                Reimposta la password</a>
            </p>
            <p>In alternativa copia e incolla il link di seguito nel browser:</p>
            <p style="word-break: break-all; color: #404040;">${resetLink}</p>
            <p>Se non hai richiesto questa operazione, ignora questa email.</p>
            <p>Cordiali saluti,<br><strong>Team RememberMe</strong></p>
          </div>
        `
      }).catch(err => console.error('Errore invio forgot email:', err));
    }

    res.json({ message: 'Se l\'email è registrata, sono state inviate istruzioni.' });
  } catch (err) {
    console.error('Errore forgot password:', err);
    res.status(500).json({ message: 'Errore interno' });
  }
});

// Endpoint per segnalazioni problemi dall'app
const reportRecipients = (process.env.REPORT_EMAILS || 'i.cassano.2566@vallauri.edu,d.racca.3256@vallauri.edu')
  .split(',')
  .map(email => email.trim())
  .filter(Boolean);

app.post('/api/report', async (req, res) => {
  try {
    const { subject, message, from } = req.body;
    if (!subject || !message) return res.status(400).json({ message: 'Dati mancanti' });

    await sendMail({
      to: reportRecipients.join(','),
      subject: `Segnalazione App: ${subject}`,
      text: `Segnalazione inviata da: ${from || 'anonimo'}\n\n${message}`,
      replyTo: from || process.env.FROM_EMAIL || smtpUser || 'no-reply@example.com'
    });

    res.json({ message: 'Segnalazione inviata' });
  } catch (err) {
    console.error('Errore invio segnalazione:', err);
    res.status(500).json({ message: 'Errore interno' });
  }
});

// ════════════════════════════════════════════════════════
//  USERS
// ════════════════════════════════════════════════════════

// Lista tutti gli user (per employee)
app.get('/api/users', async (req, res) => {
  try {
    const users = await Users.find({}, 'username email municipalityId');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Defunti assegnati a uno user
app.get('/api/users/:userId/deceased', async (req, res) => {
  try {
    const deceased = await Deceased.find({
      assignedUsers: new mongoose.Types.ObjectId(req.params.userId)
    });
    res.json(deceased);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ════════════════════════════════════════════════════════
//  CIMITERI
// ════════════════════════════════════════════════════════

app.get('/api/Cemeteries', async (req, res) => {
  try {
    const cemeteries = await Cemetery.find();
    res.json(cemeteries);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/Cemeteries/:id', async (req, res) => {
  try {
    const cemetery = await Cemetery.findById(req.params.id);
    if (!cemetery) return res.status(404).json({ message: 'Cimitero non trovato' });
    res.json(cemetery);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/Cemeteries', async (req, res) => {
  try {
    const cemetery = new Cemetery(req.body);
    const saved = await cemetery.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Defunti per cimitero
app.get('/api/Cemeteries/:id/Deceased', async (req, res) => {
  try {
    const cemetery = await Cemetery.findById(req.params.id);
    if (!cemetery) return res.status(404).json({ message: 'Cimitero non trovato' });

    const tombstones = await Tombstones.find({ cemeteryId: req.params.id });
    if (tombstones.length === 0) return res.json([]);

    const tombstoneIds = tombstones.map(t => t._id.toString());
    const deceased = await Deceased.find({ graveId: { $in: tombstoneIds } }).populate('assignedUsers');

    const enriched = deceased.map(d => {
      const tombstone = tombstones.find(t => t._id.toString() === d.graveId);
      return {
        ...d.toObject(),
        graveDetails: tombstone ? {
          section: tombstone.section,
          plotNumber: tombstone.plotNumber,
          coordinates: tombstone.coordinates,
          status: tombstone.status
        } : null
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ════════════════════════════════════════════════════════
//  DECEASED
// ════════════════════════════════════════════════════════

// ⚠️ /search PRIMA di /:id altrimenti Express legge "search" come un id
app.get('/api/Deceaseds', async (req, res) => {
  try {
    const filter = {};
    const deceased = await Deceased.find(filter).populate('assignedUsers', 'email fullName');
    res.json(deceased);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.patch('/api/Deceaseds/:id', async (req, res) => {
  try {
    const update = {};
    const allowed = ['fullName', 'birthDate', 'deathDate', 'biography', 'story', 'graveId', 'deceasedImage', 'epitaph'];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'epitaph') {
          update.biography = req.body.epitaph;
        } else {
          update[field] = req.body[field];
        }
      }
    });

    const deceased = await Deceased.findByIdAndUpdate(req.params.id, update, { new: true }).populate('assignedUsers', 'email fullName');
    if (!deceased) return res.status(404).json({ message: 'Defunto non trovato' });
    res.json(deceased);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/Deceaseds/:id', async (req, res) => {
  try {
    const deceased = await Deceased.findByIdAndDelete(req.params.id);
    if (!deceased) return res.status(404).json({ message: 'Defunto non trovato' });

    if (deceased.assignedUsers && deceased.assignedUsers.length) {
      await Users.updateMany(
        { _id: { $in: deceased.assignedUsers } },
        { $pull: { assignedDeceased: deceased._id } }
      );
    }

    res.json({ message: 'Defunto eliminato' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.patch('/api/Deceaseds/:id/assign', async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email richiesta' });

    const user = await Users.findOne({ email: { $regex: `^${email}$`, $options: 'i' } });
    if (!user) return res.status(404).json({ message: 'Utente non trovato' });

    const deceased = await Deceased.findById(req.params.id);
    if (!deceased) return res.status(404).json({ message: 'Defunto non trovato' });

    const userId = user._id;
    if (!deceased.assignedUsers.some((id) => id.equals(userId))) {
      deceased.assignedUsers.push(userId);
      await deceased.save();
    }

    if (!user.assignedDeceased.some((id) => id.equals(deceased._id))) {
      user.assignedDeceased.push(deceased._id);
      await user.save();
    }

    const updated = await Deceased.findById(req.params.id).populate('assignedUsers', 'email fullName');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.patch('/api/Deceaseds/:id/unassign', async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email richiesta' });

    const user = await Users.findOne({ email: { $regex: `^${email}$`, $options: 'i' } });
    if (!user) return res.status(404).json({ message: 'Utente non trovato' });

    const deceased = await Deceased.findById(req.params.id);
    if (!deceased) return res.status(404).json({ message: 'Defunto non trovato' });

    deceased.assignedUsers = deceased.assignedUsers.filter((id) => !id.equals(user._id));
    await deceased.save();

    user.assignedDeceased = user.assignedDeceased.filter((id) => !id.equals(deceased._id));
    await user.save();

    const updated = await Deceased.findById(req.params.id).populate('assignedUsers', 'email fullName');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/Deceaseds/search', async (req, res) => {
  try {
    const name = req.query.name;
    if (!name) return res.status(400).json({ message: 'Nome richiesto' });
    const deceased = await Deceased.find({
      fullName: { $regex: name, $options: 'i' }
    }).populate('assignedUsers');
    res.json(deceased);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/Deceaseds/:id', async (req, res) => {
  try {
    const deceased = await Deceased.findById(req.params.id).populate('assignedUsers');
    if (!deceased) return res.status(404).json({ message: 'Defunto non trovato' });
    res.json(deceased);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/Deceaseds', async (req, res) => {
  try {
    const { fullName, birthDate, deathDate, deceasedImage, assignedUsers } = req.body;
    if (!fullName || !birthDate || !deathDate)
      return res.status(400).json({ message: 'Nome, data nascita e data morte sono obbligatori' });

    const deceased = new Deceased({
      fullName, birthDate, deathDate,
      deceasedImage: deceasedImage || '',
      assignedUsers: assignedUsers || [],
      images: [],
      memories: [],
    });
    const saved = await deceased.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.patch('/api/Deceaseds/:id/story', async (req, res) => {
  try {
    const deceased = await Deceased.findByIdAndUpdate(
      req.params.id, { $set: { story: req.body.story } }, { new: true }
    );
    if (!deceased) return res.status(404).json({ message: 'Defunto non trovato' });
    res.json(deceased);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.patch('/api/Deceaseds/:id/epitaph', async (req, res) => {
  try {
    const deceased = await Deceased.findByIdAndUpdate(
      req.params.id, { $set: { biography: req.body.epitaph } }, { new: true }
    );
    if (!deceased) return res.status(404).json({ message: 'Defunto non trovato' });
    res.json(deceased);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/Deceaseds/:id/photos', async (req, res) => {
  try {
    const deceased = await Deceased.findByIdAndUpdate(
      req.params.id, { $push: { images: req.body.photo } }, { new: true }
    );
    if (!deceased) return res.status(404).json({ message: 'Defunto non trovato' });
    res.json(deceased.images);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/Deceaseds/:id/photos/:index', async (req, res) => {
  try {
    const deceased = await Deceased.findById(req.params.id);
    if (!deceased) return res.status(404).json({ message: 'Defunto non trovato' });
    deceased.images.splice(Number(req.params.index), 1);
    await deceased.save();
    res.json(deceased.images);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/Deceaseds/:id/memories', async (req, res) => {
  try {
    const { author, message, type } = req.body;
    if (!author || !message)
      return res.status(400).json({ message: 'Autore e messaggio sono obbligatori' });

    const deceased = await Deceased.findById(req.params.id);
    if (!deceased) return res.status(404).json({ message: 'Defunto non trovato' });

    const newMemory = {
      id: new mongoose.Types.ObjectId().toString(),
      deceasedId: deceased._id?.toString(),
      author: author.trim(),
      message: message.trim(),
      date: new Date(),
      type: ['memory', 'message', 'prayer'].includes(type) ? type : 'memory'
    };

    deceased.memories = [newMemory, ...(deceased.memories || [])].slice(0, 5);
    await deceased.save();
    res.status(201).json(deceased.memories);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/Deceaseds/:id/memories/:memoryId', async (req, res) => {
  try {
    const deceased = await Deceased.findById(req.params.id);
    if (!deceased) return res.status(404).json({ message: 'Defunto non trovato' });
    deceased.memories = (deceased.memories || []).filter(m => m.id !== req.params.memoryId);
    await deceased.save();
    res.json(deceased.memories);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ════════════════════════════════════════════════════════
//  START
// ════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server in ascolto su http://localhost:${PORT}`);
});