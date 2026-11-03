// 서버 응답 모양(src/server/companies.ts·workspace.ts)을 브라우저에서 쓰려고 옮겨 둔다

export type Profile = {
  id: string;
  name: string;
  label: string;
  traveler: string;
  businessIntro: string;
  proposalFilename: string | null;
  proposalChars: number;
  proposalHasOriginal: boolean;
};

export type PhotoRef = { source: "shared" | "company"; id: string };
export type PhotoView = PhotoRef & { filename: string; width: number; height: number; url: string };
export type Usage = { generateUsed: number; generateLimit: number; generateRemaining: number; tokenLimitReached: boolean };

export type DayView = {
  date: string;
  hasShared: boolean;
  draftSaved: boolean;
  schedule: { text: string; edited: boolean };
  scheduleImages: { id: string; url: string; filename: string }[];
  materials: { kind: "schedule" | "education"; filename: string; chars: number }[];
  photos: PhotoView[];
  selectedPhotos: PhotoRef[];
  notes: string;
  report: { title: string; updatedAt: string } | null;
  usage: Usage;
};

export type ReportDoc = { title: string; bodyHtml: string; updatedAt: string };
