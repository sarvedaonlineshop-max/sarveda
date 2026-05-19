export type VaidyaListItem = {
  id: string;
  slug: string;
  name: string;
  speciality: string | null;
  photoUrl: string | null;
};

export type VaidyaDetail = VaidyaListItem & {
  bio: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type MentorListItem = {
  id: string;
  slug: string;
  name: string;
  expertise: string | null;
  photoUrl: string | null;
};

export type MentorDetail = MentorListItem & {
  bio: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type RetreatListItem = {
  id: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  location: string | null;
  duration: string | null;
  priceInPaise: number | null;
};

export type RetreatDetail = RetreatListItem & {
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type OfferListItem = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
};

export type OfferDetail = OfferListItem & {
  seoTitle: string | null;
  seoDescription: string | null;
};
