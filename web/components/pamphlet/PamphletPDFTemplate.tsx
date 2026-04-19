"use client";

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { Pamphlet, PamphletItem } from "@/types/api";

// Geist-Regular.ttf — single complete TTF with full Unicode including ₹ (U+20B9)
// Bundled by Next.js in @vercel/og. LiberationSans (from pdfjs-dist) lacks ₹,
// and Roboto subset files can't be composited by react-pdf.
Font.register({
  family: "Geist",
  fonts: [
    { src: "/fonts/Geist-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/Geist-Bold.ttf", fontWeight: 700 },
  ],
});

// A4 landscape: 841.89 × 595.28 pt
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const HEADER_H = 45;
const FOOTER_H = 52;
const GRID_PAD = 5;
const CARD_GAP = 2;

const BRAND = {
  name: "PURANIC HEALTH MART",
  address: "No 17, Haripriya Nagar,\nMoka Road, Ballari - 583101",
  phone: "9663525262",
};

const styles = StyleSheet.create({
  page: { backgroundColor: "#ffffff", flexDirection: "column" },

  // ── Header ────────────────────────────────────────────────
  header: {
    height: HEADER_H,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  headerBrand: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Geist",
    fontWeight: 700,
    color: "#1d4ed8",
    letterSpacing: 0.5,
  },
  headerTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Geist",
    fontWeight: 700,
    color: "#15803d",
    textAlign: "right",
    letterSpacing: 0.5,
  },

  // ── Grid ─────────────────────────────────────────────────
  grid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    padding: GRID_PAD,
  },

  // ── Card ─────────────────────────────────────────────────
  card: {
    borderWidth: 0.5,
    borderColor: "#d1d5db",
    borderRadius: 3,
    overflow: "hidden",
    flexDirection: "column",
    margin: CARD_GAP / 2,
    backgroundColor: "#ffffff",
  },
  cardRow: {
    flex: 1,
    flexDirection: "row",
  },

  // Image section (left 50%)
  imageSection: {
    width: "50%",
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
    backgroundColor: "#f9fafb",
  },
  productImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },

  // Text section (right 50%)
  textSection: {
    width: "50%",
    flexDirection: "column",
  },
  textTop: { flex: 1, paddingHorizontal: 4, paddingTop: 4 },
  productName: {
    fontFamily: "Geist",
    fontWeight: 700,
    fontSize: 7,
    color: "#111827",
    marginBottom: 3,
    lineHeight: 1.3,
  },
  offerPrice: {
    fontFamily: "Geist",
    fontWeight: 700,
    fontSize: 9,
    color: "#16a34a",
  },
  mrpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 1,
  },
  mrp: {
    fontFamily: "Geist",
    fontSize: 7,
    color: "#9ca3af",
    textDecoration: "line-through",
  },
  onlyPrice: {
    fontFamily: "Geist",
    fontWeight: 700,
    fontSize: 9,
    color: "#16a34a",
  },

  // Badge — sits at bottom of text section
  badge: {
    backgroundColor: "#ef4444",
    paddingVertical: 2,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontFamily: "Geist",
    fontWeight: 700,
    fontSize: 6.5,
    color: "#ffffff",
    textAlign: "center",
  },
  badgeSpacer: { height: 14 }, // keeps height consistent when no badge

  // ── Footer ────────────────────────────────────────────────
  footer: {
    height: FOOTER_H,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  footerLeft: { flexDirection: "column" },
  footerBrand: {
    fontFamily: "Geist",
    fontWeight: 700,
    fontSize: 8,
    color: "#1d4ed8",
  },
  footerAddress: {
    fontSize: 7,
    color: "#6b7280",
    marginTop: 2,
    lineHeight: 1.4,
  },
  footerRight: { alignItems: "flex-end" },
  footerContact: {
    fontFamily: "Geist",
    fontWeight: 700,
    fontSize: 9,
    color: "#15803d",
  },
  footerDelivery: {
    fontSize: 7,
    color: "#dc2626",
    fontFamily: "Geist",
    fontWeight: 700,
    marginTop: 2,
  },
});

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function ProductCard({
  item,
  cardW,
  cardH,
}: {
  item: PamphletItem;
  cardW: number;
  cardH: number;
}) {
  const name = item.display_name ?? item.barcode ?? "Product";
  const hasOffer = item.offer_price != null;
  const hasMrp = item.original_price != null;
  const hasDiscount = hasOffer && hasMrp;

  return (
    <View style={[styles.card, { width: cardW, height: cardH }]}>
      <View style={styles.cardRow}>
        {/* Image — left 50% */}
        <View style={styles.imageSection}>
          {item.image_url ? (
            <Image src={item.image_url} style={styles.productImage} />
          ) : (
            <View style={styles.imagePlaceholder} />
          )}
        </View>

        {/* Text — right 50% */}
        <View style={styles.textSection}>
          <View style={styles.textTop}>
            <Text style={styles.productName}>{name}</Text>
            {hasDiscount ? (
              <>
                <Text style={styles.offerPrice}>
                  ₹{item.offer_price!.toFixed(2)}
                </Text>
                <View style={styles.mrpRow}>
                  <Text style={styles.mrp}>
                    ₹{item.original_price!.toFixed(0)}
                  </Text>
                </View>
              </>
            ) : hasMrp ? (
              <Text style={styles.onlyPrice}>
                ₹{item.original_price!.toFixed(2)}
              </Text>
            ) : null}
          </View>

          {/* Badge — bottom of text section only */}
          {item.highlight_text ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.highlight_text}</Text>
            </View>
          ) : (
            <View style={styles.badgeSpacer} />
          )}
        </View>
      </View>
    </View>
  );
}

export function PamphletPDFTemplate({ pamphlet }: { pamphlet: Pamphlet }) {
  const { rows, cols, items, title } = pamphlet;
  const perPage = rows * cols;
  const pages = chunk(items, perPage);

  const availW = PAGE_W - GRID_PAD * 2;
  const availH = PAGE_H - HEADER_H - FOOTER_H - GRID_PAD * 2;
  const cardW = availW / cols - CARD_GAP;
  const cardH = availH / rows - CARD_GAP;

  return (
    <Document title={title} author={BRAND.name}>
      {pages.map((pageItems, pi) => (
        <Page key={pi} size="A4" orientation="landscape" style={styles.page}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerBrand}>{BRAND.name}</Text>
            <Text style={styles.headerTitle}>{title}</Text>
          </View>

          {/* Grid */}
          <View style={styles.grid}>
            {pageItems.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                cardW={cardW}
                cardH={cardH}
              />
            ))}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              <Text style={styles.footerBrand}>{BRAND.name}</Text>
              <Text style={styles.footerAddress}>{BRAND.address}</Text>
            </View>
            <View style={styles.footerRight}>
              <Text style={styles.footerContact}>
                CONTACT: {BRAND.phone}
              </Text>
              <Text style={styles.footerDelivery}>FOR FREE HOME DELIVERY</Text>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
}
