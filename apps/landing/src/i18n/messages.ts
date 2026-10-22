// The shape of every dictionary: a text added here must be written in each
// language (en.ts, es.ts) before the site compiles.

/** A headline as it is set: two lines, broken where the words read best. */
export type TwoLines = readonly [string, string];

export interface Capability {
  readonly name: string;
  readonly description: string;
}

/** A section of a text page (privacy): a heading and its paragraphs. */
export interface TextSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

export interface Messages {
  /** The language's own name, as the language links show it. */
  readonly languageName: string;
  readonly skipToContent: string;
  /** What the shared picture shows (public/og.png), for those who cannot see it. */
  readonly shareImageAlt: string;
  readonly header: {
    /** Accessible name of the navigation landmark. */
    readonly navigation: string;
    readonly getApp: string;
  };
  readonly home: {
    /** The page title (browser tab, search results), after the site's name. */
    readonly title: string;
    readonly description: string;
    readonly heading: TwoLines;
    readonly lead: string;
    readonly action: string;
    /** What the picture of the app in the phone shows, for screen readers. */
    readonly phone: string;
  };
  readonly capabilities: {
    readonly heading: string;
    readonly items: readonly [
      Capability,
      Capability,
      Capability,
      Capability,
      Capability,
      Capability,
    ];
  };
  readonly howItWorks: {
    readonly heading: string;
    readonly steps: readonly [Capability, Capability, Capability];
  };
  readonly download: {
    readonly heading: string;
    readonly body: string;
    /** Shown while no store listing exists (lib/stores.ts). */
    readonly soon: string;
    readonly appStore: string;
    readonly googlePlay: string;
  };
  readonly callToAction: {
    readonly heading: TwoLines;
    readonly body: string;
    readonly action: string;
  };
  readonly footer: {
    readonly product: string;
    readonly privacy: string;
    readonly deleteAccount: string;
    readonly languages: string;
    readonly rights: string;
    readonly backToTop: string;
  };
  readonly notFound: {
    readonly title: string;
    readonly heading: TwoLines;
    readonly body: string;
    readonly action: string;
  };
  readonly openInApp: {
    readonly title: string;
    readonly heading: TwoLines;
    readonly lead: string;
    readonly steps: readonly [string, string, string];
    readonly action: string;
  };
  readonly privacy: {
    readonly title: string;
    readonly description: string;
    readonly heading: string;
    /** Shown on the page until the project writes its own legal text. */
    readonly templateNotice: string;
    readonly sections: readonly TextSection[];
  };
  readonly deleteAccount: {
    readonly title: string;
    readonly description: string;
    readonly heading: string;
    readonly lead: string;
    readonly inApp: { readonly heading: string; readonly steps: readonly string[] };
    readonly byEmail: { readonly heading: string; readonly body: string; readonly subject: string };
    readonly deleted: TextSection;
    readonly kept: TextSection;
  };
}
