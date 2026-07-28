import { z } from "zod";

export const searchSchema = z.object({
  destination: z.string().min(2),
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  guests: z.coerce.number().int().min(1).max(20)
});

export const bookingSchema = z.object({
  hotelSlug: z.string().min(1),
  roomId: z.string().uuid(),
  checkIn: z.string().date(),
  checkOut: z.string().date(),
  guests: z.coerce.number().int().min(1).max(20)
});

export const partnerApplicationSchema = z.object({
  propertyName: z.string().min(2),
  contactName: z.string().min(2),
  email: z.string().email(),
  propertyType: z.enum(["hotel", "resort", "vacation_home"])
});

export const checkoutSchema = z.object({
  hotelSlug: z.string().min(1),
  roomId: z.string().uuid(),
  checkIn: z.string().date(),
  checkOut: z.string().date(),
  guests: z.coerce.number().int().min(1).max(20)
});

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().max(254),
  message: z.string().trim().min(10).max(3000)
});

export const propertySchema = z.object({
  name: z.string().trim().min(3).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  type: z.enum(["hotel", "resort", "vacation_home"]),
  starRating: z.coerce.number().int().refine((value) => value === 4 || value === 5, "Only 4- and 5-star properties are accepted."),
  description: z.string().trim().min(30).max(4000),
  city: z.string().trim().min(2).max(100),
  region: z.string().trim().max(100).optional(),
  country: z.string().trim().min(2).max(100)
});

export const propertyContentSchema = z.object({
  imageUrl: z.string().url().max(2000),
  amenities: z.array(z.string().trim().min(2).max(80)).min(1).max(20)
});

export const roomSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  maxGuests: z.coerce.number().int().min(1).max(30),
  baseRate: z.coerce.number().min(25).max(25000)
});

export const inventorySchema = z.object({
  roomId: z.string().uuid(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  availableUnits: z.coerce.number().int().min(0).max(500),
  rate: z.coerce.number().min(25).max(25000)
});
