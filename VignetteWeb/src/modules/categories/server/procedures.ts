import { db, isDatabaseConfigured } from "@/db";
import { categories } from "@/db/schema";
import { baseProcedure, createTRPCRouter } from "@/trpc/init";

export const categoriesRouter = createTRPCRouter({
  getMany: baseProcedure.query(async () => {
    if (!isDatabaseConfigured) {
      return [];
    }

    const data = await db.select().from(categories);

    return data;
  }),
});
