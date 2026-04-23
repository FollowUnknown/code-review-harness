import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createPlan,
  findPlanById,
  listPlans,
  updatePlan,
  deletePlan,
  addPlanItems,
  removePlanItem,
  updatePlanItem,
  getPlanItems,
  getPlanDetail,
} from "../src/server/services/plan-store";
import { getDb, closeDb } from "../src/server/db";

process.env.KNOWLEDGE_DB_PATH = ":memory:";

beforeEach(() => {
  closeDb();
  getDb();
});

afterEach(() => {
  closeDb();
});

describe("plan-store", () => {
  describe("createPlan + findPlanById", () => {
    it("creates and retrieves a plan", () => {
      const plan = createPlan("Sprint 23 Review", "All frontend MRs", "user-1");
      expect(plan.id).toMatch(/^PLAN-/);
      expect(plan.title).toBe("Sprint 23 Review");
      expect(plan.description).toBe("All frontend MRs");
      expect(plan.status).toBe("open");
      expect(plan.created_by).toBe("user-1");

      const found = findPlanById(plan.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe("Sprint 23 Review");
    });

    it("returns null for non-existent ID", () => {
      expect(findPlanById("PLAN-FAKE")).toBeNull();
    });

    it("handles null description", () => {
      const plan = createPlan("No desc plan", null, "user-1");
      expect(plan.description).toBeNull();
      const found = findPlanById(plan.id);
      expect(found!.description).toBeNull();
    });
  });

  describe("listPlans", () => {
    it("returns empty list when no plans", () => {
      const result = listPlans({ page: 1, pageSize: 20 });
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("returns paginated results with item_count", () => {
      const plan = createPlan("Plan A", null, "user-1");
      addPlanItems(plan.id, [
        "https://gitlab.com/g/p/-/merge_requests/1",
        "https://gitlab.com/g/p/-/merge_requests/2",
      ]);
      createPlan("Plan B", null, "user-1");

      const result = listPlans({ page: 1, pageSize: 20 });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      const planA = result.items.find((i) => i.id === plan.id);
      expect(planA!.item_count).toBe(2);
    });

    it("filters by status", () => {
      const p1 = createPlan("Open", null, "user-1");
      const p2 = createPlan("To archive", null, "user-1");
      updatePlan(p2.id, { status: "archived" });

      const openPlans = listPlans({ status: "open", page: 1, pageSize: 20 });
      expect(openPlans.items).toHaveLength(1);
      expect(openPlans.items[0].id).toBe(p1.id);

      const archived = listPlans({ status: "archived", page: 1, pageSize: 20 });
      expect(archived.items).toHaveLength(1);
      expect(archived.items[0].id).toBe(p2.id);
    });

    it("paginates correctly", () => {
      for (let i = 0; i < 5; i++) createPlan(`Plan ${i}`, null, "user-1");

      const page1 = listPlans({ page: 1, pageSize: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.totalPages).toBe(3);
    });
  });

  describe("updatePlan", () => {
    it("updates title", () => {
      const plan = createPlan("Old", null, "user-1");
      updatePlan(plan.id, { title: "New" });
      const found = findPlanById(plan.id);
      expect(found!.title).toBe("New");
    });

    it("updates status", () => {
      const plan = createPlan("Plan", null, "user-1");
      updatePlan(plan.id, { status: "reviewing" });
      const found = findPlanById(plan.id);
      expect(found!.status).toBe("reviewing");
    });

    it("returns false for non-existent ID", () => {
      expect(updatePlan("PLAN-FAKE", { title: "x" })).toBe(false);
    });

    it("returns true with no fields to update", () => {
      const plan = createPlan("Plan", null, "user-1");
      expect(updatePlan(plan.id, {})).toBe(true);
    });
  });

  describe("deletePlan", () => {
    it("deletes plan and its items", () => {
      const plan = createPlan("Plan", null, "user-1");
      addPlanItems(plan.id, ["https://gitlab.com/g/p/-/merge_requests/1"]);
      expect(deletePlan(plan.id)).toBe(true);
      expect(findPlanById(plan.id)).toBeNull();
      expect(getPlanItems(plan.id)).toHaveLength(0);
    });

    it("returns false for non-existent ID", () => {
      expect(deletePlan("PLAN-FAKE")).toBe(false);
    });
  });

  describe("addPlanItems", () => {
    it("adds multiple items with incrementing positions", () => {
      const plan = createPlan("Plan", null, "user-1");
      const items = addPlanItems(plan.id, [
        "https://gitlab.com/g/p/-/merge_requests/1",
        "https://gitlab.com/g/p/-/merge_requests/2",
        "https://gitlab.com/g/p/-/merge_requests/3",
      ]);
      expect(items).toHaveLength(3);
      expect(items[0].position).toBe(0);
      expect(items[1].position).toBe(1);
      expect(items[2].position).toBe(2);
      expect(items[0].status).toBe("pending");
    });

    it("appends after existing items", () => {
      const plan = createPlan("Plan", null, "user-1");
      addPlanItems(plan.id, ["https://gitlab.com/g/p/-/merge_requests/1"]);
      const more = addPlanItems(plan.id, ["https://gitlab.com/g/p/-/merge_requests/2"]);
      expect(more[0].position).toBe(1);
    });
  });

  describe("removePlanItem", () => {
    it("removes an item", () => {
      const plan = createPlan("Plan", null, "user-1");
      const items = addPlanItems(plan.id, [
        "https://gitlab.com/g/p/-/merge_requests/1",
        "https://gitlab.com/g/p/-/merge_requests/2",
      ]);
      expect(removePlanItem(plan.id, items[0].id)).toBe(true);
      expect(getPlanItems(plan.id)).toHaveLength(1);
    });

    it("returns false for non-existent item", () => {
      const plan = createPlan("Plan", null, "user-1");
      expect(removePlanItem(plan.id, "PI-FAKE")).toBe(false);
    });
  });

  describe("updatePlanItem", () => {
    it("updates status and review_id", () => {
      const plan = createPlan("Plan", null, "user-1");
      const [item] = addPlanItems(plan.id, ["https://gitlab.com/g/p/-/merge_requests/1"]);
      updatePlanItem(plan.id, item.id, { status: "completed", review_id: "R-abc" });
      const items = getPlanItems(plan.id);
      expect(items[0].status).toBe("completed");
      expect(items[0].review_id).toBe("R-abc");
    });

    it("returns false for non-existent item", () => {
      const plan = createPlan("Plan", null, "user-1");
      expect(updatePlanItem(plan.id, "PI-FAKE", { status: "completed" })).toBe(false);
    });
  });

  describe("getPlanDetail", () => {
    it("returns plan with items", () => {
      const plan = createPlan("Plan", "desc", "user-1");
      addPlanItems(plan.id, [
        "https://gitlab.com/g/p/-/merge_requests/1",
        "https://gitlab.com/g/p/-/merge_requests/2",
      ]);
      const detail = getPlanDetail(plan.id);
      expect(detail).not.toBeNull();
      expect(detail!.title).toBe("Plan");
      expect(detail!.description).toBe("desc");
      expect(detail!.items).toHaveLength(2);
    });

    it("returns null for non-existent ID", () => {
      expect(getPlanDetail("PLAN-FAKE")).toBeNull();
    });
  });
});
