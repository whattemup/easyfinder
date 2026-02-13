import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type React from "react";
import { AuthProvider } from "../src/lib/auth";
import { NdaProvider } from "../src/lib/nda";

const AUTH_SESSION_STORAGE_KEY = "easyfinder_auth_session";

const renderGuard = async (
  initialEntries: string[],
  RequireLiveNda: React.ComponentType<{ fetchNdaStatus?: () => Promise<{ accepted: boolean }> }>,
  fetchNdaStatus: () => Promise<{ accepted: boolean }>
) => {
  return render(
    <AuthProvider>
      <NdaProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/app/*" element={<RequireLiveNda fetchNdaStatus={fetchNdaStatus} />}>
              <Route path="listings" element={<div>Listings content</div>} />
              <Route path="nda" element={<div>NDA Page</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </NdaProvider>
    </AuthProvider>
  );
};

describe("RequireLiveNda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        token: "jwt-123",
        user: { id: "u1", email: "buyer@easyfinder.ai", name: "Buyer", role: "buyer" },
      })
    );
  });

  it("redirects to /app/nda when NDA is not accepted", async () => {
    const { RequireLiveNda } = await import("../src/components/RequireLiveNda");
    const fetchNdaStatus = vi.fn().mockResolvedValue({ accepted: false });

    await renderGuard(["/app/listings"], RequireLiveNda, fetchNdaStatus);

    expect(await screen.findByText("NDA Page")).toBeInTheDocument();
    expect(fetchNdaStatus).toHaveBeenCalledTimes(1);
  });

  it("renders listings when NDA is accepted", async () => {
    const { RequireLiveNda } = await import("../src/components/RequireLiveNda");
    const fetchNdaStatus = vi.fn().mockResolvedValue({ accepted: true });

    await renderGuard(["/app/listings"], RequireLiveNda, fetchNdaStatus);

    expect(await screen.findByText("Listings content")).toBeInTheDocument();
    expect(fetchNdaStatus).toHaveBeenCalledTimes(1);
  });

  it("shows error and retries NDA check", async () => {
    const user = userEvent.setup();
    const { RequireLiveNda } = await import("../src/components/RequireLiveNda");
    const fetchNdaStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error("API unavailable"))
      .mockResolvedValueOnce({ accepted: true });

    await renderGuard(["/app/listings"], RequireLiveNda, fetchNdaStatus);

    expect(await screen.findByText("API unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(fetchNdaStatus).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Listings content")).toBeInTheDocument();
  });
});
