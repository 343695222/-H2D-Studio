import { create } from 'zustand';
import { apiGet, apiPost, apiDelete } from '../api/client.ts';

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

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  pages: PageSummary[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchProjects: () => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (name: string, description?: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  fetchPages: (projectId: string) => Promise<void>;
  deletePage: (projectId: string, pageId: string) => Promise<void>;
  clearError: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  currentProject: null,
  pages: [],
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await apiGet<Project[]>('/projects');
      set({ projects, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch projects',
        loading: false,
      });
    }
  },

  fetchProject: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const project = await apiGet<Project>(`/projects/${id}`);
      set({ currentProject: project, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch project',
        loading: false,
      });
    }
  },

  createProject: async (name: string, description = '') => {
    set({ loading: true, error: null });
    try {
      const project = await apiPost<Project>('/projects', { name, description });
      set((state) => ({
        projects: [project, ...state.projects],
        loading: false,
      }));
      return project;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create project',
        loading: false,
      });
      throw error;
    }
  },

  deleteProject: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await apiDelete(`/projects/${id}`);
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        currentProject: state.currentProject?.id === id ? null : state.currentProject,
        loading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete project',
        loading: false,
      });
      throw error;
    }
  },

  fetchPages: async (projectId: string) => {
    set({ loading: true, error: null });
    try {
      const pages = await apiGet<PageSummary[]>(`/projects/${projectId}/pages`);
      set({ pages, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch pages',
        loading: false,
      });
    }
  },

  deletePage: async (projectId: string, pageId: string) => {
    set({ loading: true, error: null });
    try {
      await apiDelete(`/projects/${projectId}/pages/${pageId}`);
      set((state) => ({
        pages: state.pages.filter((p) => p.id !== pageId),
        loading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete page',
        loading: false,
      });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
