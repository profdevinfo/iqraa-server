import express from "express";
import cors from "cors";
import { createRequire } from "module";

import {rateLimit} from "express-rate-limit"

import pkg from 'jsonwebtoken';
const { verify, sign } = pkg;

import { initializeApp, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
// const { initializeApp, cert } = require('firebase-admin/app');
// const { getFirestore } = require('firebase-admin/firestore');

//const limiter = rateLimit({
//  windowMs: 15 * 60 * 1000, // 15 دقيقة
//  max: 5, // 5 محاولات كحد أقصى
//  message: 'تم تجاوز عدد المحاولات المسموح بها. الرجاء المحاولة بعد 15 دقيقة',
//});

const app = express();

const require = createRequire(import.meta.url);


// Store request counts per IP
const requestCounts = {};

// Custom rate limiter middleware
const rateLimiter = (req, res, next) => {
  const { lang } = req.body;
  const ip = req.ip;
  const now = Date.now();
  
  if (!requestCounts[ip]) {
    requestCounts[ip] = { count: 1, lastRequest: now };
  } else {
    const timeSinceLastRequest = now - requestCounts[ip].lastRequest;
    const timeLimit = 15 * 60 * 1000; // 15 minutes

    if (timeSinceLastRequest < timeLimit) {
      requestCounts[ip].count += 1;
    } else {
      requestCounts[ip] = { count: 1, lastRequest: now }; // Reset after time window
    }
  }

  const maxRequests = 10;

  if (requestCounts[ip].count > maxRequests) {
    let msg = 'Too many requests,please try again after 15 minutes.'
      if(lang!=='en'){
        msg = lang === 'ar' ? 'تم تجاوز عدد المحاولات المسموح بها. الرجاء المحاولة بعد 15 دقيقة' :'Trop de demandes, veuillez réessayer après 15 minutes.'
      }
    return res.status(429).json({ 
      message: msg });
  }

  requestCounts[ip].lastRequest = now;
  next();
};





// const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const serviceAccount = require('./serviceAccountKey.json');


initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();


app.get("/message", (_, res) => res.send("Hello from express!"));



// المفتاح السري لـ JWT - يجب تخزينه في متغيرات البيئة
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

app.use(cors());
app.use(express.json());
app.use('/api/login', rateLimiter)

// Middleware للتحقق من صحة JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      message_ar: 'غير مصرح', 
      message: 'Unauthorized' });
  }

  verify(token, JWT_SECRET, (err, school) => {
    if (err) {
      return res.status(403).json({ 
        message_ar: 'الرمز غير صالح أو منتهي الصلاحية',
        message: 'Invalid or expired token' });
    }
    req.school = school;
    next();
  });
};

// مسار تسجيل الدخول والتحقق من رمز المدرسة
app.post('/api/login', async (req, res) => {
  try {
    const { schoolKey , lang } = req.body;
    // console.log('schoolKey',schoolKey)
    // return res.status(401).json({ message: schoolKey});
    let msg = ''
    if (!schoolKey) {
      msg = 'School key is required'
      if(lang!=='en'){
        msg = lang === 'ar' ? 'رمز المدرسة مطلوب' :'La clé de l\'école est requise'
      }
      return res.status(400).json({ 
        // message_ar: 'رمز المدرسة مطلوب' ,
        // message_fr: 'La clé de l\'école est requise',
        message: msg
      });

    }

    // البحث عن المدرسة في Firestore
    const schoolsRef = db.collection('schools');
    const snapshot = await schoolsRef.where('admin_key', '==', schoolKey).get();

    if (snapshot.empty) {
      msg = 'Invalid school key'
      if(lang!=='en'){
        msg = lang === 'ar' ?  'رمز المدرسة غير صحيح'  :'Clé d\'école invalide'
      }
      return res.status(401).json({ 
        // message_ar: 'رمز المدرسة غير صحيح' ,
        // message_fr: 'Clé d\'école invalide' ,
        message: msg
      });
    }

    const schoolDoc = snapshot.docs[0];
    const schoolData = schoolDoc.data();
    if(!schoolData.subscription.active){

      msg = 'Subscription is not active'
      if(lang!=='en'){
        msg = lang === 'ar' ?  'الاشتراك غير مفعل'  :'Abonnement non actif'
      }

      return res.status(401).json({ 
        // message_ar: 'الاشتراك غير مفعل' ,
        // message_fr: 'Abonnement non actif' ,
        message: msg
      });
    }
    if(schoolData.subscription.endDate.toDate() < new Date().getTime()){

      msg = 'Subscription has expired'
      if(lang!=='en'){
        msg = lang === 'ar' ?   'انتهت صلاحية الاشتراك' :'Abonnement expiré' 
      }

      return res.status(401).json({ 
        // message_ar: 'انتهت صلاحية الاشتراك' ,
        // message_fr: 'Abonnement expiré' ,
        message: msg
      });
    }
    // إنشاء JWT token
    const token = sign(
      {
        schoolId: schoolDoc.id,
        name: schoolData.name,
        name_ar: schoolData.name_ar,

      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // إرجاع Token وبيانات المدرسة الأساسية
    res.json({
      token,
      school: {
        id: schoolDoc.id,
        name: schoolData.name,
        name_ar: schoolData.name_ar,
      }
    });

  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ message: 'Error in login:'+ error });
  }
});



// مثال على مسار محمي
app.get('/api/school-data', authenticateToken, async (req, res) => {
  try {
    const schoolDoc = await db.collection('schools').doc(req.school.schoolId).get();
    
    if (!schoolDoc.exists) {
      return res.status(404).json({ message: 'لم يتم العثور على المدرسة' });
    }

    const schoolData = schoolDoc.data();
    delete schoolData.schoolKey; // حذف البيانات الحساسة

    res.json({ school: schoolData });
  } catch (error) {
    console.error('Error fetching school data:', error);
    res.status(500).json({ message: 'حدث خطأ في الخادم' });
  }
});

const PORT = process.env.PORT || 3030;


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
