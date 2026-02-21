<template>
  <image class="app-icon" :style="iconStyle" :src="iconSrc" mode="aspectFit" />
</template>

<script>
const ICON_PATHS = {
  home: `
    <path d="M3 9.5L12 3l9 6.5"/>
    <path d="M5 10.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9.5"/>
  `,
  sparkles: `
    <path d="M12 3.5 13.8 8.2 18.5 10 13.8 11.8 12 16.5 10.2 11.8 5.5 10 10.2 8.2Z"/>
    <path d="M18.5 3.5v3"/>
    <path d="M17 5h3"/>
    <path d="M19.8 14.8v2.7"/>
    <path d="M18.45 16.15h2.7"/>
  `,
  calendar: `
    <path d="M8 3.5v3"/>
    <path d="M16 3.5v3"/>
    <rect x="3" y="5.5" width="18" height="15" rx="2.5"/>
    <path d="M3 10h18"/>
  `,
  user: `
    <circle cx="12" cy="8" r="4"/>
    <path d="M4.5 20c1.8-3.4 4.3-5 7.5-5s5.7 1.6 7.5 5"/>
  `,
  bell: `
    <path d="M6.2 9.6a5.8 5.8 0 1 1 11.6 0v3.6l1.8 2v1H4.4v-1l1.8-2Z"/>
    <path d="M9.3 18a2.7 2.7 0 0 0 5.4 0"/>
  `,
  search: `
    <circle cx="11" cy="11" r="6.2"/>
    <path d="m16 16 4.2 4.2"/>
  `,
  sliders: `
    <path d="M5 6.5h14"/>
    <path d="M5 12h14"/>
    <path d="M5 17.5h14"/>
    <circle cx="9" cy="6.5" r="1.5"/>
    <circle cx="15" cy="12" r="1.5"/>
    <circle cx="11" cy="17.5" r="1.5"/>
  `,
  x: `
    <path d="m6 6 12 12"/>
    <path d="m18 6-12 12"/>
  `,
  'map-pin': `
    <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z"/>
    <circle cx="12" cy="11" r="2.2"/>
  `,
  compass: `
    <circle cx="12" cy="12" r="9"/>
    <path d="m15.8 8.2-2.3 6-6 2.3 2.3-6Z"/>
  `,
  walk: `
    <circle cx="13" cy="5" r="2"/>
    <path d="m10.5 10 2.2-1.6 1.8 1.8 2.2 1.3"/>
    <path d="m11 14-1.5 3.8"/>
    <path d="m14 13.5-1 5"/>
  `,
  phone: `
    <path d="M5.3 3.8h3.1l1 2.8-1.6 1.6a14 14 0 0 0 7.2 7.2l1.6-1.6 2.8 1v3.1c0 .8-.7 1.5-1.5 1.5A14.5 14.5 0 0 1 3.8 5.3c0-.8.7-1.5 1.5-1.5Z"/>
  `,
  file: `
    <path d="M8 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 7 20V5A1.5 1.5 0 0 1 8.5 3.5Z"/>
    <path d="M14 3.5V8h4"/>
    <path d="M9.5 12.5h5"/>
    <path d="M9.5 16h5"/>
  `,
  refresh: `
    <path d="M20 7v4h-4"/>
    <path d="M4 17v-4h4"/>
    <path d="M6.3 9.2A7 7 0 0 1 18 11"/>
    <path d="M17.7 14.8A7 7 0 0 1 6 13"/>
  `,
  shield: `
    <path d="M12 3.5 19 6v5.5c0 4.6-3.2 7.8-7 9-3.8-1.2-7-4.4-7-9V6Z"/>
    <path d="m9.2 12 1.8 1.8 3.8-3.8"/>
  `,
  mailbox: `
    <path d="M3.5 8.5h17v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z"/>
    <path d="m3.5 9 8.5 6 8.5-6"/>
  `,
  'mailbox-open': `
    <path d="M4 9.5h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/>
    <path d="m4.2 9.5 7.8 5.6 7.8-5.6"/>
    <path d="M3.5 7.5 12 3l8.5 4.5"/>
  `,
  store: `
    <path d="M4 8.5h16l-1.3 4.3a2.2 2.2 0 0 1-2.1 1.6h-9.2a2.2 2.2 0 0 1-2.1-1.6Z"/>
    <path d="M5.5 14.5V20h13v-5.5"/>
    <path d="M9.5 20v-3.5h5V20"/>
    <path d="M6 5.5h12"/>
  `,
  clock: `
    <circle cx="12" cy="12" r="8.8"/>
    <path d="M12 7.5v4.8l3 1.8"/>
  `,
  lightbulb: `
    <path d="M12 3.5a6 6 0 0 0-3.8 10.6c.9.8 1.5 1.8 1.6 2.9h4.4c.1-1.1.7-2.1 1.6-2.9A6 6 0 0 0 12 3.5Z"/>
    <path d="M9.8 19h4.4"/>
    <path d="M10.5 21h3"/>
  `,
  'check-circle': `
    <circle cx="12" cy="12" r="9"/>
    <path d="m8.5 12 2.2 2.2 4.8-4.8"/>
  `,
  'x-circle': `
    <circle cx="12" cy="12" r="9"/>
    <path d="m9 9 6 6"/>
    <path d="m15 9-6 6"/>
  `,
  'alert-triangle': `
    <path d="M12 4.5 20 19H4Z"/>
    <path d="M12 9v4.5"/>
    <path d="M12 16.5h.01"/>
  `,
  eye: `
    <path d="M2.8 12s3.3-5.5 9.2-5.5 9.2 5.5 9.2 5.5-3.3 5.5-9.2 5.5S2.8 12 2.8 12Z"/>
    <circle cx="12" cy="12" r="2.6"/>
  `,
  'eye-off': `
    <path d="m3.5 3.5 17 17"/>
    <path d="M9.5 6.9A8.8 8.8 0 0 1 12 6.5c5.9 0 9.2 5.5 9.2 5.5a17.7 17.7 0 0 1-4.1 4.4"/>
    <path d="M6.4 9.1A17.5 17.5 0 0 0 2.8 12s3.3 5.5 9.2 5.5c1.2 0 2.4-.2 3.4-.6"/>
    <path d="M10.7 10.7A2.6 2.6 0 0 0 12 14.6"/>
  `
};

export default {
  name: 'AppIcon',
  data() {
    return {
      viewportWidth: 375
    };
  },
  props: {
    name: {
      type: String,
      default: ''
    },
    color: {
      type: String,
      default: '#64748B'
    },
    size: {
      type: [Number, String],
      default: 32
    },
    sizeUnit: {
      type: String,
      default: 'rpx'
    },
    rpxBoost: {
      type: [Number, String],
      default: 1.16
    },
    strokeWidth: {
      type: [Number, String],
      default: 2
    }
  },
  created() {
    try {
      const info = uni.getSystemInfoSync ? uni.getSystemInfoSync() : null;
      const width = Number((info && info.windowWidth) || 0);
      if (width > 0) {
        this.viewportWidth = width;
      }
    } catch (e) {}
  },
  computed: {
    normalizedBoost() {
      const boost = Number(this.rpxBoost);
      if (!Number.isFinite(boost) || boost <= 0) return 1;
      return boost;
    },
    iconStyle() {
      const sizeText = String(this.size || '').trim();
      const matched = sizeText.match(/^(-?\d+(?:\.\d+)?)([a-z%]+)$/i);
      if (matched) {
        const rawSize = Number(matched[1]) || 0;
        const unit = String(matched[2] || '').toLowerCase();
        if (unit === 'rpx') {
          const pxSize = Math.max(
            1,
            Math.round((rawSize * this.viewportWidth * this.normalizedBoost) / 750)
          );
          return {
            width: `${pxSize}px`,
            height: `${pxSize}px`
          };
        }
        return {
          width: `${rawSize}${unit}`,
          height: `${rawSize}${unit}`
        };
      }
      if (/[a-z%]+$/i.test(sizeText)) {
        return {
          width: sizeText,
          height: sizeText
        };
      }
      const size = Number(this.size) || 32;
      const unit = String(this.sizeUnit || 'rpx').trim() || 'rpx';
      if (unit.toLowerCase() === 'rpx') {
        const pxSize = Math.max(
          1,
          Math.round((size * this.viewportWidth * this.normalizedBoost) / 750)
        );
        return {
          width: `${pxSize}px`,
          height: `${pxSize}px`
        };
      }
      return {
        width: `${size}${unit}`,
        height: `${size}${unit}`
      };
    },
    iconSrc() {
      const paths = ICON_PATHS[this.name] || ICON_PATHS.file;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${this.color}" stroke-width="${this.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }
  }
};
</script>

<style scoped>
.app-icon {
  display: inline-block;
  flex-shrink: 0;
}
</style>
