const baseURL = import.meta.env.VITE_BACKEND_URL;

class TrashService {
  getHeaders(includeContentType = true) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  }

  async parseErrorResponse(res) {
    try {
      const data = await res.json();
      return data.message || data.error || 'An error occurred';
    } catch {
      return res.statusText || 'An error occurred';
    }
  }

  async list(projectId, params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const res = await fetch(`${baseURL}/api/projects/${projectId}/trash?${qs.toString()}`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      const errorMsg = await this.parseErrorResponse(res);
      throw new Error(errorMsg);
    }
    const data = await res.json();
    return data;
  }

  async restore(attachmentId) {
    const res = await fetch(`${baseURL}/api/attachments/${attachmentId}/restore`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    if (!res.ok) {
      const errorMsg = await this.parseErrorResponse(res);
      throw new Error(errorMsg);
    }
    const data = await res.json();
    return data;
  }

  async permanentDelete(attachmentId) {
    const res = await fetch(`${baseURL}/api/attachments/${attachmentId}/permanent`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    if (!res.ok) {
      const errorMsg = await this.parseErrorResponse(res);
      throw new Error(errorMsg);
    }
    const data = await res.json();
    return data;
  }

  async bulkRestore(ids) {
    const res = await fetch(`${baseURL}/api/attachments/bulk/restore`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ ids })
    });
    if (!res.ok) {
      const errorMsg = await this.parseErrorResponse(res);
      throw new Error(errorMsg);
    }
    const data = await res.json();
    return data;
  }

  async bulkPermanentDelete(ids) {
    const res = await fetch(`${baseURL}/api/attachments/bulk/permanent`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: JSON.stringify({ ids })
    });
    if (!res.ok) {
      const errorMsg = await this.parseErrorResponse(res);
      throw new Error(errorMsg);
    }
    const data = await res.json();
    return data;
  }
}

export default new TrashService();
