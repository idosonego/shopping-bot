# בוט "קניות" לוואטסאפ - גרסת ענן (Meta Cloud API + Vercel)

הבוט הזה רץ **רק כשמגיעה הודעה** - אין תהליך שצריך להישאר דלוק. כל ההקמה
נעשית דרך הדפדפן, בלי להתקין שום דבר על המחשב. אחרי ההקמה, אתה משתמש
בבוט אך ורק מהטלפון - שולח הודעות וואטסאפ רגילות.

יש 4 שלבים חד-פעמיים:
1. **GitHub** - מעלים לשם את קוד הבוט (בלי git, דרך העלאת קבצים רגילה באתר).
2. **Upstash** - מקימים מסד נתונים קטן וחינמי לשמירת הרשימה.
3. **Vercel** - מחברים ל-GitHub, וזה מריץ את הבוט אוטומטית בענן.
4. **Meta for Developers** - מקימים את חשבון ה-WhatsApp Business API ומחברים
   אותו לכתובת שVercel נתן.

---

## שלב 1: העלאת הקוד ל-GitHub

1. גש ל-github.com (אתה כבר רשום).
2. לחץ על **+** בפינה הימנית העליונה -> **New repository**.
3. תן שם, לדוגמה `shopping-bot`. השאר "Public" או "Private" - לא משנה. לחץ
   **Create repository**.
4. בעמוד שנפתח, לחץ על הקישור **uploading an existing file**.
5. גרור לשם את כל 3 הקבצים: `package.json`, `categories.json`, ואת התיקייה
   `api` (עם `webhook.js` בפנים). אם גרירת תיקייה לא עובדת, העלה קודם את
   שני הקבצים, ואז לחץ שוב "Add file" -> "Create new file", כתוב בשם הקובץ
   `api/webhook.js` (זה ייצור את התיקייה אוטומטית), והדבק לתוכו את התוכן.
6. גלול למטה ולחץ **Commit changes**.

## שלב 2: הקמת Upstash (מסד נתונים חינמי)

1. גש ל-**upstash.com** ולחץ **Sign up** (אפשר עם Google).
2. אחרי הכניסה, לחץ **Create Database**.
3. תן שם (לדוגמה `shopping-list`), בחר region קרוב (Australia אם קיים,
   אחרת הכי קרוב), השאר את שאר ההגדרות ברירת מחדל, ולחץ **Create**.
4. בעמוד של מסד הנתונים, גלול לחלק **REST API** - שם תראה שני ערכים:
   `UPSTASH_REDIS_REST_URL` ו-`UPSTASH_REDIS_REST_TOKEN`. **תשמור אותם בצד**
   (העתק-הדבק למסמך זמני) - נצטרך אותם בשלב הבא.

## שלב 3: פריסה ב-Vercel

1. גש ל-**vercel.com** ולחץ **Sign up** -> **Continue with GitHub** (הכי
   פשוט, זה גם מחבר אוטומטית את שני החשבונות).
2. לחץ **Add New** -> **Project**.
3. תראה רשימת הריפוזיטוריז שלך מ-GitHub - לחץ **Import** ליד `shopping-bot`.
4. לפני שלוחצים Deploy, פתח את **Environment Variables** והוסף:
   - `UPSTASH_REDIS_REST_URL` = הערך ששמרת מ-Upstash
   - `UPSTASH_REDIS_REST_TOKEN` = הערך ששמרת מ-Upstash
   - `VERIFY_TOKEN` = מילה שרירותית שאתה בוחר בעצמך, לדוגמה `my-secret-123`
     (תשמור אותה בצד, נצטרך אותה גם בשלב הבא)
   - `WHATSAPP_TOKEN` ו-`WHATSAPP_PHONE_NUMBER_ID` - עדיין אין לך אותם,
     תשאיר זמנית ריק כל אחד עם ערך placeholder כמו `TBD` (נחזור לזה בשלב 4).
5. לחץ **Deploy**. בסיום תקבל כתובת ציבורית כמו:
   `https://shopping-bot-xxxx.vercel.app`
   **שמור אותה** - זה ה-URL של הוובהוק שלך יהיה:
   `https://shopping-bot-xxxx.vercel.app/api/webhook`

## שלב 4: הקמת Meta WhatsApp Business API

1. גש ל-**developers.facebook.com** והתחבר עם חשבון פייסבוק (אם אין לך,
   צריך ליצור אחד - חינמי).
2. לחץ **My Apps** -> **Create App**. בחר סוג App: **Business**. תן שם ולחץ
   **Create App**.
3. בתפריט המוצרים בצד, מצא **WhatsApp** ולחץ **Set up**.
4. תראה מסך עם **מספר טלפון בדיקה חינמי** שמטא נותנת אוטומטית - אפשר
   להשתמש בו לבדיקות (הוא מוגבל למספר נמענים מאושרים, אבל אתה יכול להוסיף
   את המספר שלך עצמך כנמען מאושר בכמה קליקים באותו מסך).
5. באותו עמוד תראה **Temporary access token** - העתק אותו.
6. חזור ל-Vercel -> הפרויקט שלך -> **Settings** -> **Environment Variables**,
   ועדכן:
   - `WHATSAPP_TOKEN` = הטוקן שהעתקת
   - `WHATSAPP_PHONE_NUMBER_ID` = ה-Phone number ID שמופיע באותו עמוד ב-Meta
   שמור, ולך ל-**Deployments** -> לחץ על שלוש הנקודות בדיפלוי האחרון ->
   **Redeploy** (כדי שהמשתנים החדשים ייכנסו לתוקף).
7. חזרה ב-Meta: לך ל-**WhatsApp** -> **Configuration**. בשדה **Callback URL**
   הכנס: `https://shopping-bot-xxxx.vercel.app/api/webhook`
   ובשדה **Verify Token** הכנס בדיוק את מה שבחרת ב-`VERIFY_TOKEN` (לדוגמה
   `my-secret-123`). לחץ **Verify and Save**.
8. עדיין באותו עמוד, תחת **Webhook fields**, לחץ **Manage** וסמן
   **messages**.

זהו - הבוט חי. שלח הודעה מהטלפון שלך (מהמספר שאישרת כנמען בדיקה) למספר
הבדיקה של WhatsApp שמטא נתנה, ותקבל תשובה.

## הערה חשובה על ה-Token הזמני
ה-Temporary access token שקיבלת בשלב 4 פג תוקף אחרי כ-24 שעות. כשזה קורה
הבוט יפסיק לענות. יש שתי דרכים להתמודד:
- **הכי פשוט**: לחזור לאותו עמוד ב-Meta ולהעתיק טוקן זמני חדש בכל פעם
  שצריך (מעדכנים ב-Vercel ועושים Redeploy).
- **קבוע**: ליצור "System User" עם טוקן שלא פג תוקף - זה תהליך נוסף
  בהגדרות ה-Business Manager של מטא. תגיד לי אם תרצה שאדריך אותך גם בזה
  כשתגיע לשם.

## התאמת סדר המחלקות
כמו בגרסאות הקודמות - ערכו את `categories.json` בגיטהאב (ניתן לערוך קובץ
ישירות באתר GitHub עם כפתור העיפרון) לפי סדר המחלקות בסניף שלכם. כל שינוי
בגיטהאב גורם ל-Vercel לפרוס מחדש אוטומטית.
