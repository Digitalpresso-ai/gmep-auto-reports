/** Tailwind CSS v3 preset. Load tokens.css first; every value is a CSS variable so dark mode follows data-theme. */
module.exports = {
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    "colors": {
      "bg": "var(--bg)",
      "bg-subtle": "var(--bg-subtle)",
      "surface": "var(--surface)",
      "surface-raised": "var(--surface-raised)",
      "surface-inverse": "var(--surface-inverse)",
      "fill": "var(--fill)",
      "fill-hover": "var(--fill-hover)",
      "fill-pressed": "var(--fill-pressed)",
      "state-hover": "var(--state-hover)",
      "state-pressed": "var(--state-pressed)",
      "selected": "var(--selected)",
      "border": "var(--border)",
      "border-strong": "var(--border-strong)",
      "border-control": "var(--border-control)",
      "text-primary": "var(--text-primary)",
      "text-secondary": "var(--text-secondary)",
      "text-tertiary": "var(--text-tertiary)",
      "text-disabled": "var(--text-disabled)",
      "text-inverse": "var(--text-inverse)",
      "icon-primary": "var(--icon-primary)",
      "icon-secondary": "var(--icon-secondary)",
      "accent": "var(--accent)",
      "accent-hover": "var(--accent-hover)",
      "accent-pressed": "var(--accent-pressed)",
      "accent-soft": "var(--accent-soft)",
      "accent-soft-hover": "var(--accent-soft-hover)",
      "accent-text": "var(--accent-text)",
      "on-accent": "var(--on-accent)",
      "danger": "var(--danger)",
      "danger-hover": "var(--danger-hover)",
      "danger-soft": "var(--danger-soft)",
      "danger-text": "var(--danger-text)",
      "on-danger": "var(--on-danger)",
      "warning": "var(--warning)",
      "warning-soft": "var(--warning-soft)",
      "warning-text": "var(--warning-text)",
      "success": "var(--success)",
      "success-soft": "var(--success-soft)",
      "success-text": "var(--success-text)",
      "info": "var(--info)",
      "info-soft": "var(--info-soft)",
      "info-text": "var(--info-text)",
      "scrim": "var(--scrim)",
      "link": "var(--link)",
      "gray-0": "var(--gray-0)",
      "gray-25": "var(--gray-25)",
      "gray-50": "var(--gray-50)",
      "gray-100": "var(--gray-100)",
      "gray-200": "var(--gray-200)",
      "gray-300": "var(--gray-300)",
      "gray-400": "var(--gray-400)",
      "gray-500": "var(--gray-500)",
      "gray-600": "var(--gray-600)",
      "gray-700": "var(--gray-700)",
      "gray-800": "var(--gray-800)",
      "gray-850": "var(--gray-850)",
      "gray-900": "var(--gray-900)",
      "gray-950": "var(--gray-950)",
      "gray-1000": "var(--gray-1000)",
      "blue-50": "var(--blue-50)",
      "blue-100": "var(--blue-100)",
      "blue-200": "var(--blue-200)",
      "blue-300": "var(--blue-300)",
      "blue-400": "var(--blue-400)",
      "blue-500": "var(--blue-500)",
      "blue-600": "var(--blue-600)",
      "blue-700": "var(--blue-700)",
      "blue-800": "var(--blue-800)",
      "blue-900": "var(--blue-900)",
      "red-50": "var(--red-50)",
      "red-100": "var(--red-100)",
      "red-300": "var(--red-300)",
      "red-400": "var(--red-400)",
      "red-500": "var(--red-500)",
      "red-600": "var(--red-600)",
      "red-700": "var(--red-700)",
      "red-900": "var(--red-900)",
      "orange-50": "var(--orange-50)",
      "orange-100": "var(--orange-100)",
      "orange-300": "var(--orange-300)",
      "orange-400": "var(--orange-400)",
      "orange-500": "var(--orange-500)",
      "orange-600": "var(--orange-600)",
      "orange-700": "var(--orange-700)",
      "orange-900": "var(--orange-900)",
      "green-50": "var(--green-50)",
      "green-100": "var(--green-100)",
      "green-200": "var(--green-200)",
      "green-300": "var(--green-300)",
      "green-400": "var(--green-400)",
      "green-500": "var(--green-500)",
      "green-600": "var(--green-600)",
      "green-700": "var(--green-700)",
      "green-800": "var(--green-800)",
      "green-900": "var(--green-900)"
    },
    "spacing": {
      "0": "var(--space-0)",
      "2": "var(--space-2)",
      "4": "var(--space-4)",
      "6": "var(--space-6)",
      "8": "var(--space-8)",
      "12": "var(--space-12)",
      "16": "var(--space-16)",
      "20": "var(--space-20)",
      "24": "var(--space-24)",
      "32": "var(--space-32)",
      "40": "var(--space-40)",
      "48": "var(--space-48)",
      "64": "var(--space-64)",
      "96": "var(--space-96)",
      "128": "var(--space-128)"
    },
    "borderRadius": {
      "none": "var(--radius-none)",
      "xs": "var(--radius-xs)",
      "sm": "var(--radius-sm)",
      "md": "var(--radius-md)",
      "lg": "var(--radius-lg)",
      "xl": "var(--radius-xl)",
      "2xl": "var(--radius-2xl)",
      "full": "var(--radius-full)"
    },
    "boxShadow": {
      "none": "var(--shadow-none)",
      "xs": "var(--shadow-xs)",
      "sm": "var(--shadow-sm)",
      "md": "var(--shadow-md)",
      "lg": "var(--shadow-lg)"
    },
    "fontFamily": {
      "sans": [
        "var(--font-sans)"
      ],
      "mono": [
        "var(--font-mono)"
      ]
    },
    "fontSize": {
      "display-1": [
        "56px",
        {
          "lineHeight": "68px",
          "fontWeight": "700",
          "letterSpacing": "-0.03em"
        }
      ],
      "display-2": [
        "44px",
        {
          "lineHeight": "56px",
          "fontWeight": "700",
          "letterSpacing": "-0.025em"
        }
      ],
      "title-1": [
        "32px",
        {
          "lineHeight": "42px",
          "fontWeight": "700",
          "letterSpacing": "-0.022em"
        }
      ],
      "title-2": [
        "26px",
        {
          "lineHeight": "35px",
          "fontWeight": "700",
          "letterSpacing": "-0.02em"
        }
      ],
      "title-3": [
        "22px",
        {
          "lineHeight": "31px",
          "fontWeight": "600",
          "letterSpacing": "-0.018em"
        }
      ],
      "headline": [
        "18px",
        {
          "lineHeight": "27px",
          "fontWeight": "600",
          "letterSpacing": "-0.012em"
        }
      ],
      "body-lg": [
        "17px",
        {
          "lineHeight": "27px",
          "fontWeight": "400",
          "letterSpacing": "-0.01em"
        }
      ],
      "body": [
        "15px",
        {
          "lineHeight": "24px",
          "fontWeight": "400",
          "letterSpacing": "-0.006em"
        }
      ],
      "body-sm": [
        "14px",
        {
          "lineHeight": "21px",
          "fontWeight": "400",
          "letterSpacing": "-0.004em"
        }
      ],
      "label-lg": [
        "17px",
        {
          "lineHeight": "24px",
          "fontWeight": "600",
          "letterSpacing": "-0.01em"
        }
      ],
      "label": [
        "15px",
        {
          "lineHeight": "22px",
          "fontWeight": "600",
          "letterSpacing": "-0.006em"
        }
      ],
      "label-sm": [
        "13px",
        {
          "lineHeight": "18px",
          "fontWeight": "600"
        }
      ],
      "caption": [
        "13px",
        {
          "lineHeight": "19px",
          "fontWeight": "400"
        }
      ],
      "caption-sm": [
        "12px",
        {
          "lineHeight": "16px",
          "fontWeight": "500",
          "letterSpacing": "0.01em"
        }
      ],
      "code": [
        "13px",
        {
          "lineHeight": "20px",
          "fontWeight": "400"
        }
      ],
      "code-sm": [
        "12px",
        {
          "lineHeight": "18px",
          "fontWeight": "500"
        }
      ]
    },
    "screens": {
      "sm": "480px",
      "md": "768px",
      "lg": "1024px",
      "xl": "1440px"
    },
    "transitionTimingFunction": {
      "standard": "var(--ease-standard)",
      "out": "var(--ease-out)",
      "in": "var(--ease-in)",
      "spring": "var(--ease-spring)"
    },
    "transitionDuration": {
      "instant": "var(--duration-instant)",
      "fast": "var(--duration-fast)",
      "base": "var(--duration-base)",
      "slow": "var(--duration-slow)",
      "reveal": "var(--duration-reveal)"
    },
    "zIndex": {
      "base": "0",
      "sticky": "100",
      "dropdown": "1000",
      "overlay": "1300",
      "modal": "1400",
      "toast": "1500",
      "tooltip": "1600"
    }
  },
};
