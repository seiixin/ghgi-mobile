// mobile/src/lib/submissions.js
import axios from 'axios';

export const submitForm = async (data) => {
  try {
    const response = await axios.post('/api/submissions', data);
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Failed to submit');
  }
};
