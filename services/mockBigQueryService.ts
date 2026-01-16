import { PlatformResult } from '../types';

// IMPORTANT: Update this URL to your deployed Cloud Run URL when in production
// For local development, it defaults to localhost:5000
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export const fetchReconciliationData = async (date: string): Promise<PlatformResult[]> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/reconcile?date=${date}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch reconciliation data');
        }

        const data: PlatformResult[] = await response.json();
        return data;
    } catch (error) {
        console.error("API Call Error:", error);
        throw error;
    }
};