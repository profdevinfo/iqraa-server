import express from "express";
import cors from "cors";
import { createRequire } from "module";

// const cors = require('cors');
// const { verify, sign } = require('jsonwebtoken');
import { initializeApp, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
// const { initializeApp, cert } = require('firebase-admin/app');
// const { getFirestore } = require('firebase-admin/firestore');

const app = express();

const require = createRequire(import.meta.url);


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

// Middleware للتحقق من صحة JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'غير مصرح' });
  }

  verify(token, JWT_SECRET, (err, school) => {
    if (err) {
      return res.status(403).json({ message: 'الرمز غير صالح أو منتهي الصلاحية' });
    }
    req.school = school;
    next();
  });
};

// مسار تسجيل الدخول والتحقق من رمز المدرسة
app.post('/api/login', async (req, res) => {
  try {
    const { schoolKey } = req.body;
    // console.log('schoolKey',schoolKey)
    // return res.status(401).json({ message: schoolKey});

    if (!schoolKey) {
      return res.status(400).json({ message: 'رمز المدرسة مطلوب' });
    }

    // البحث عن المدرسة في Firestore
    const schoolsRef = db.collection('schools');
    const snapshot = await schoolsRef.where('admin_key', '==', schoolKey).get();

    if (snapshot.empty) {
      return res.status(401).json({ message: 'رمز المدرسة غير صحيح' });
    }

    const schoolDoc = snapshot.docs[0];
    const schoolData = schoolDoc.data();
    if(!schoolData.subscription.active){
      return res.status(401).json({ message: 'المدرسة غير مفعلة' });
    }
    if(schoolData.subscription.endDate.toDate() < new Date().getTime()){
      return res.status(401).json({ message: 'انتهت صلاحية الاشتراك' 
        
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
    res.status(500).json({ message: 'حدث خطأ في الخادم' });
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
