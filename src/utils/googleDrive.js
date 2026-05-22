/**
 * Google Drive API REST Client using direct Fetch and Google Identity Services.
 */

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
let tokenClient = null;

/**
 * Initializes the OAuth token client from GIS.
 */
export function initOAuthClient(clientId, onToken, onError) {
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    if (onError) onError('Google Identity Services SDK not loaded yet. Retrying...');
    return null;
  }

  try {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (response) => {
        if (response.error) {
          if (onError) onError(response.error_description || response.error);
        } else if (response.access_token) {
          onToken(response.access_token, response.expires_in);
        }
      },
    });
    return tokenClient;
  } catch (err) {
    if (onError) onError('GIS Init Error: ' + err.message);
    return null;
  }
}

/**
 * Opens the Google Sign-in popup.
 */
export function loginToGoogle() {
  if (tokenClient) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    throw new Error('Google OAuth client not initialized. Enter your Client ID first.');
  }
}

/**
 * Helper to execute fetch requests with Bearer Auth and JSON decoding.
 */
async function apiRequest(url, method = 'GET', token, body = null, headers = {}) {
  const defaultHeaders = {
    'Authorization': `Bearer ${token}`,
    ...headers
  };

  const options = {
    method,
    headers: defaultHeaders
  };

  if (body) {
    if (body instanceof Blob || body instanceof ArrayBuffer || body instanceof FormData) {
      options.body = body;
    } else if (typeof body === 'string') {
      options.body = body;
      if (!options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'text/plain';
      }
    } else {
      options.body = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    let parsedErr;
    try {
      parsedErr = JSON.parse(errorText);
    } catch {
      parsedErr = { error: { message: errorText } };
    }
    throw new Error(parsedErr?.error?.message || `HTTP ${response.status} - ${response.statusText}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

/**
 * Searches for a folder by name. Returns the folder object or null.
 */
async function findFolder(name, token) {
  const query = encodeURIComponent(`name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;
  const res = await apiRequest(url, 'GET', token);
  return res.files && res.files.length > 0 ? res.files[0] : null;
}

/**
 * Creates a folder. Returns the folder object.
 */
async function createFolder(name, token) {
  const url = `https://www.googleapis.com/drive/v3/files`;
  const body = {
    name,
    mimeType: 'application/vnd.google-apps.folder'
  };
  return apiRequest(url, 'POST', token, body);
}

/**
 * Searches for a file inside a specific parent folder.
 */
async function findFileInFolder(fileName, folderId, token) {
  const query = encodeURIComponent(`name = '${fileName}' and '${folderId}' in parents and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;
  const res = await apiRequest(url, 'GET', token);
  return res.files && res.files.length > 0 ? res.files[0] : null;
}

/**
 * Downloads a file's content directly as text and parses it.
 */
async function downloadFileContent(fileId, token) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to download file. Status ${response.status}`);
  }

  const text = await response.text();
  
  // Robust parser that handles standard JSON content AND JS variable content (e.g. window.appData = {...})
  try {
    return JSON.parse(text);
  } catch (err) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (nestedErr) {
        throw new Error('File appData.js found but contains invalid JSON: ' + nestedErr.message);
      }
    }
    throw new Error('File appData.js found but format is unrecognized: ' + err.message);
  }
}

/**
 * Creates a file in a folder with content (JSON database).
 * Uses Google Drive's multipart upload API.
 */
async function createFileInFolder(fileName, folderId, content, token) {
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: 'application/javascript' // Since it is appData.js
  };

  const boundary = 'trader_boundary_marker';

  // We write standard JSON string as file contents, but label it appData.js
  const fileContentString = JSON.stringify(content, null, 2);

  const multipartBody = 
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    'Content-Type: text/plain\r\n\r\n' +
    fileContentString +
    `\r\n--${boundary}--`;

  const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  return apiRequest(url, 'POST', token, multipartBody, {
    'Content-Type': `multipart/related; boundary=${boundary}`
  });
}

/**
 * Updates an existing file's content.
 */
async function updateFileContent(fileId, content, token) {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  const fileContentString = JSON.stringify(content, null, 2);
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain'
    },
    body: fileContentString
  });

  if (!response.ok) {
    throw new Error(`Failed to save database. Status ${response.status}`);
  }
  return response.json();
}

/**
 * Loads the TradeR database. If the folder or file doesn't exist, it creates them.
 * Returns: { fileId, data }
 */
export async function syncAndLoadDatabase(token) {
  // 1. Find or create the "TradeR" folder
  let folder = await findFolder('TradeR', token);
  if (!folder) {
    folder = await createFolder('TradeR', token);
  }

  const folderId = folder.id;

  // 2. Find or create "appData.js"
  let file = await findFileInFolder('appData.js', folderId, token);
  
  if (!file) {
    // File doesn't exist, initialize default database state
    const defaultDb = {
      transactions: [],
      settings: {
        inventoryMethod: 'FIFO' // default
      }
    };

    const newFile = await createFileInFolder('appData.js', folderId, defaultDb, token);
    return {
      fileId: newFile.id,
      data: defaultDb
    };
  }

  // 3. File exists, download content
  const dbData = await downloadFileContent(file.id, token);
  return {
    fileId: file.id,
    data: dbData
  };
}

/**
 * Saves (updates) the database file in Google Drive.
 */
export async function saveDatabaseToDrive(fileId, data, token) {
  if (!fileId) throw new Error('Cannot save: No Google Drive file ID available.');
  return updateFileContent(fileId, data, token);
}
