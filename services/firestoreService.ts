import { db } from "../firebaseConfig";
import { collection, addDoc, query, orderBy, getDocs, Timestamp, doc, updateDoc } from "firebase/firestore";
import { DailyReport, PortfolioItem } from "../types";

const COLLECTION_NAME = "daily_reports";

export const saveDailyReport = async (report: Omit<DailyReport, 'id'>) => {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...report,
      timestamp: Timestamp.now()
    });
    console.log("Document written with ID: ", docRef.id);
    return docRef.id;
  } catch (e) {
    console.error("Error adding document: ", e);
    // Allow app to continue even if firebase fails (for demo purposes if user hasn't set up key)
    alert("Error saving to Firebase. Check console and firebaseConfig.ts");
    return null;
  }
};

export const getDailyReports = async (): Promise<DailyReport[]> => {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    const reports: DailyReport[] = [];
    querySnapshot.forEach((doc) => {
      reports.push({ id: doc.id, ...doc.data() } as DailyReport);
    });
    return reports;
  } catch (e) {
    console.error("Error getting documents: ", e);
    return [];
  }
};

export const updateReportPrices = async (reportId: string, updatedFinalists: PortfolioItem[]) => {
  try {
    const reportRef = doc(db, COLLECTION_NAME, reportId);
    await updateDoc(reportRef, {
      finalists: updatedFinalists
    });
  } catch (e) {
    console.error("Error updating document: ", e);
  }
};
