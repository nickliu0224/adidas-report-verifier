import { db } from './firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import { PlatformResult } from '../types';

export interface SavedReport {
    id: string;
    targetDate: string;
    runBy: string;
    runAt: any; // Timestamp
    results: PlatformResult[];
    note?: string;
    status: 'OPEN' | 'REVIEWED' | 'RESOLVED';
}

const COLLECTION_NAME = 'reconciliation_reports';

// CREATE
export const saveReport = async (targetDate: string, runBy: string, results: PlatformResult[]) => {
    try {
        await addDoc(collection(db, COLLECTION_NAME), {
            targetDate,
            runBy,
            runAt: Timestamp.now(),
            results,
            status: 'OPEN',
            note: ''
        });
        return true;
    } catch (error) {
        console.error("Error saving report: ", error);
        throw error;
    }
};

// READ
export const getHistory = async (): Promise<SavedReport[]> => {
    try {
        const q = query(collection(db, COLLECTION_NAME), orderBy('runAt', 'desc'));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as SavedReport));
    } catch (error) {
        console.error("Error fetching history: ", error);
        throw error;
    }
};

// UPDATE
export const updateReportNote = async (id: string, note: string, status: SavedReport['status']) => {
    try {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, { note, status });
        return true;
    } catch (error) {
        console.error("Error updating report: ", error);
        throw error;
    }
};

// DELETE
export const deleteReport = async (id: string) => {
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
        return true;
    } catch (error) {
        console.error("Error deleting report: ", error);
        throw error;
    }
};