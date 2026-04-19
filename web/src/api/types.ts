export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
}

export interface PageSummary {
  id: string;
  name: string;
  url: string;
  capturedAt: string;
  screenshotPath: string;
  hasEdited: boolean;
}

export interface AppSettings {
  ai: {
    provider: string;
    apiKey: string;
    baseUrl: string;
    model: string;
  };
}
