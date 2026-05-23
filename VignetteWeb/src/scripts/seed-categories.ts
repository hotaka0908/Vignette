import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const categoryNames = [
  "Cars and vehicles",
  "Comedy",
  "Education",
  "Gaming",
  "Entertainment",
  "Film and animation",
  "How-to and style",
  "Music",
  "News and politics",
  "People and blogs",
  "Pets and animals",
  "Science and technology",
  "Sports",
  "Travel and events",
];

async function main() {
  console.log("Seeding categories...");

  try {
    const [{ db }, { categories }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
    ]);

    const existingCategories = await db
      .select({ id: categories.id })
      .from(categories)
      .limit(1);

    if (existingCategories.length > 0) {
      console.log("Categories already exist. Skipping seed.");
      return;
    }

    const values = categoryNames.map((name) => ({
      name,
      description: `Videos related to ${name.toLowerCase()}`,
    }));

    await db.insert(categories).values(values);

    console.log("Categories seeded successfully!");
  } catch (error) {
    console.error("Error seeding categories: ", error);
    process.exit(1);
  }
}

main();
