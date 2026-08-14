// Thin axios wrapper around the case search API.
const api = {
  async listCases() {
    const { data } = await axios.get('/api/cases');
    return data;
  },

  async getCaseByCnr(cnr) {
    const { data } = await axios.get(`/api/cases/${encodeURIComponent(cnr)}`);
    return data;
  },
};
