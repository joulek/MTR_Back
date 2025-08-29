// MTR_Backend/routes/product.routes.js
import { Router } from "express";
import { upload } from "../middleware/upload.js";
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getProductsByCategory                // ⬅️ import

} from "../controllers/product.controller.js";
import Product from "../models/Product.js";
const router = Router();
router.get("/", async (_req, res) => {
  try {
    const data = await Product.find({}).select("name_fr name_en").sort({ name_fr: 1 }).lean();
    res.json({ success: true, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});
router.get("/by-category/:categoryId", getProductsByCategory); // ⬅️ NEW


router.post("/", upload.array("images", 20), createProduct);
//router.get("/", getProducts);
router.get("/:id", getProductById);
router.put("/:id", upload.array("images", 20), updateProduct); // maj avec images
router.delete("/:id", deleteProduct);


export default router;
