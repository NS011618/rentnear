import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Search, MapPin, SlidersHorizontal, Heart, ArrowUpRight, ShieldCheck,
  BedDouble, Building2, Home, Wind, Plus, Menu, X, CheckCircle2,
  BadgeCheck, LayoutGrid, Map as MapIcon, Sparkles, CircleDollarSign,
  KeyRound, UserRound, LogOut, Loader2, Phone, Mail, CalendarDays,
  Trash2, PauseCircle, PlayCircle, Eye, ImagePlus, AlertTriangle
} from "lucide-react";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, updateProfile
} from "firebase/auth";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp,
  setDoc, updateDoc, where
} from "firebase/firestore";
import {
  deleteObject, getDownloadURL, ref, uploadBytes
} from "firebase/storage";
import { auth, db, storage } from "./firebase";
import "./styles.css";

const TYPES = ["All homes", "Flat", "House", "Room", "PG", "Studio"];
const PROPERTY_CONFIGS = ["Studio / 1 RK", "1 BHK", "2 BHK", "3 BHK", "4+ BHK", "Private room", "Single sharing", "Double sharing", "Triple sharing", "Full PG"];
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const friendlyError = (error) => {
  const code = error?.code || "";
  if (code.includes("auth/email-already-in-use")) return "That email already has an account. Sign in instead.";
  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password") || code.includes("auth/user-not-found")) return "Email or password is incorrect.";
  if (code.includes("auth/weak-password")) return "Please use a password with at least 6 characters.";
  if (code.includes("auth/invalid-email")) return "Please enter a valid email address.";
  if (code.includes("auth/operation-not-allowed")) return "Email/password sign-in is not enabled in Firebase Authentication yet.";
  if (code.includes("permission-denied")) return "Firebase blocked this action. Deploy the Firestore and Storage rules included in the repository.";
  if (code.includes("storage/unauthorized")) return "Firebase Storage blocked the image upload. Deploy storage.rules and confirm Storage is enabled.";
  if (code.includes("storage/bucket-not-found") || code.includes("storage/no-default-bucket")) return "Create/enable a Storage bucket for the it0108 Firebase project.";
  if (code.includes("unavailable") || code.includes("network-request-failed")) return "Firebase is unreachable right now. Check your connection and Firebase project settings.";
  return error?.message || "Something went wrong. Please try again.";
};

const initialForm = () => ({
  title: "", type: "Flat", config: "2 BHK", city: "Hyderabad", area: "",
  pincode: "", address: "", rent: "15000", furnishing: "Semi-furnished",
  availableFrom: "", description: "", amenities: "Parking, Balcony",
  ownerName: "", ownerPhone: "", acceptsZeroDeposit: false, publishesPhone: false
});

function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [listings, setListings] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [firebaseError, setFirebaseError] = useState("");
  const [notice, setNotice] = useState("");
  const [queryText, setQueryText] = useState("");
  const [type, setType] = useState("All homes");
  const [maxRent, setMaxRent] = useState(30000);
  const [furnishing, setFurnishing] = useState("Any");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem("rentnear-saved") || "[]"); }
    catch { return []; }
  });
  const [view, setView] = useState("grid");
  const [showMine, setShowMine] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [pendingListing, setPendingListing] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerError, setOwnerError] = useState("");
  const [ownerForm, setOwnerForm] = useState(initialForm);
  const [photos, setPhotos] = useState([]);
  const [selectedListing, setSelectedListing] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setAuthReady(true);
  }), []);

  useEffect(() => {
    setLoadingListings(true);
    setFirebaseError("");
    const q = query(collection(db, "listings"), where("status", "==", "active"));
    return onSnapshot(q, (snapshot) => {
      const next = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      next.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setListings(next);
      setLoadingListings(false);
      setFirebaseError("");
    }, (error) => {
      setLoadingListings(false);
      setFirebaseError(friendlyError(error));
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setMyListings([]);
      return undefined;
    }
    const q = query(collection(db, "listings"), where("ownerUid", "==", user.uid));
    return onSnapshot(q, (snapshot) => {
      const next = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      next.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setMyListings(next);
    }, (error) => setNotice(friendlyError(error)));
  }, [user]);

  useEffect(() => {
    localStorage.setItem("rentnear-saved", JSON.stringify(saved));
  }, [saved]);

  function toast(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4200);
  }

  const filteredListings = useMemo(() => listings.filter((listing) => {
    const haystack = [
      listing.title, listing.area, listing.city, listing.pincode, listing.address,
      listing.type, listing.config, listing.description, ...(listing.amenities || [])
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(queryText.trim().toLowerCase())
      && (type === "All homes" || listing.type === type)
      && Number(listing.rent) <= maxRent
      && (furnishing === "Any" || listing.furnishing === furnishing)
      && (!verifiedOnly || listing.verified === true);
  }), [listings, queryText, type, maxRent, furnishing, verifiedOnly]);

  function toggleSaved(id) {
    setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function requestOwnerListing() {
    setOwnerError("");
    if (!user) {
      setPendingListing(true);
      setAuthMode("signup");
      setAuthError("");
      setAuthOpen(true);
      return;
    }
    setOwnerForm((current) => ({ ...current, ownerName: current.ownerName || user.displayName || "", }));
    setOwnerOpen(true);
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const displayName = String(formData.get("name") || "").trim();
    try {
      if (authMode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) await updateProfile(credential.user, { displayName });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setAuthOpen(false);
      setAuthError("");
      toast(authMode === "signup" ? "Account created. Welcome to RentNear!" : "You're signed in.");
      if (pendingListing) {
        setOwnerForm((current) => ({ ...current, ownerName: current.ownerName || displayName || auth.currentUser?.displayName || "" }));
        setOwnerOpen(true);
        setPendingListing(false);
      }
    } catch (error) {
      setAuthError(friendlyError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      setShowMine(false);
      toast("Signed out.");
    } catch (error) {
      toast(friendlyError(error));
    }
  }

  async function handleCreateListing(event) {
    event.preventDefault();
    if (!user) {
      setOwnerOpen(false);
      setPendingListing(true);
      setAuthOpen(true);
      return;
    }
    setOwnerBusy(true);
    setOwnerError("");
    const form = ownerForm;
    if (!form.acceptsZeroDeposit) {
      setOwnerError("Please accept the mandatory ₹0 security-deposit policy.");
      setOwnerBusy(false);
      return;
    }
    if (!form.publishesPhone) {
      setOwnerError("Please confirm that renters may see the contact number you provide.");
      setOwnerBusy(false);
      return;
    }
    if (photos.length < 1 || photos.length > MAX_PHOTOS) {
      setOwnerError(`Please select between 1 and ${MAX_PHOTOS} property photos.`);
      setOwnerBusy(false);
      return;
    }
    if (photos.some((photo) => !photo.type.startsWith("image/") || photo.size > MAX_PHOTO_BYTES)) {
      setOwnerError("Each photo must be an image smaller than 5 MB.");
      setOwnerBusy(false);
      return;
    }
    const rent = Number(form.rent);
    if (!Number.isFinite(rent) || rent <= 0) {
      setOwnerError("Enter a valid monthly rent.");
      setOwnerBusy(false);
      return;
    }

    const listingRef = doc(collection(db, "listings"));
    const uploadedPaths = [];
    try {
      const uploadedImages = await Promise.all(photos.map(async (photo, index) => {
        const cleanName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || `photo-${index + 1}.jpg`;
        const storagePath = `listingPhotos/${user.uid}/${listingRef.id}/${Date.now()}-${index}-${cleanName}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, photo, { contentType: photo.type });
        uploadedPaths.push(storagePath);
        return { url: await getDownloadURL(storageRef), path: storagePath };
      }));

      const amenities = form.amenities.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 15);
      await setDoc(listingRef, {
        title: form.title.trim(),
        type: form.type,
        config: form.config,
        city: form.city.trim(),
        area: form.area.trim(),
        pincode: form.pincode.trim(),
        address: form.address.trim(),
        rent,
        furnishing: form.furnishing,
        availableFrom: form.availableFrom || "Available now",
        description: form.description.trim(),
        amenities,
        images: uploadedImages.map((item) => item.url),
        imagePaths: uploadedImages.map((item) => item.path),
        ownerUid: user.uid,
        ownerName: form.ownerName.trim() || user.displayName || "Property owner",
        ownerPhone: form.ownerPhone.trim(),
        contactPublic: true,
        zeroDepositAccepted: true,
        status: "active",
        verified: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setOwnerOpen(false);
      setOwnerForm(initialForm());
      setPhotos([]);
      setShowMine(false);
      setQueryText("");
      setType("All homes");
      toast("Your property is now listed on RentNear.");
      document.getElementById("homes")?.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      await Promise.all(uploadedPaths.map((path) => deleteObject(ref(storage, path)).catch(() => undefined)));
      setOwnerError(friendlyError(error));
    } finally {
      setOwnerBusy(false);
    }
  }

  async function changeStatus(listing, status) {
    try {
      await updateDoc(doc(db, "listings", listing.id), { status, updatedAt: serverTimestamp() });
      toast(status === "active" ? "Listing is visible to renters again." : status === "rented" ? "Listing marked as rented." : "Listing paused.");
    } catch (error) {
      toast(friendlyError(error));
    }
  }

  async function removeListing(listing) {
    if (!window.confirm(`Delete "${listing.title}"? This cannot be undone.`)) return;
    try {
      await Promise.all((listing.imagePaths || []).map((path) => deleteObject(ref(storage, path)).catch(() => undefined)));
      await deleteDoc(doc(db, "listings", listing.id));
      setSelectedListing(null);
      toast("Listing deleted.");
    } catch (error) {
      toast(friendlyError(error));
    }
  }

  const currentCards = showMine ? myListings : filteredListings;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" onClick={(event) => { event.preventDefault(); setShowMine(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <span className="brand-mark"><Home size={21} strokeWidth={2.5} /></span>
          <span>rent<span className="brand-accent">near</span><small>Find a home, not a deposit.</small></span>
        </a>
        <nav className={mobileMenu ? "nav-links open" : "nav-links"}>
          <a href="#homes" onClick={() => { setShowMine(false); setMobileMenu(false); }}>Find a home</a>
          <a href="#how" onClick={() => setMobileMenu(false)}>How it works</a>
          <a href="#safety" onClick={() => setMobileMenu(false)}>Safe renting</a>
        </nav>
        <div className="header-actions">
          {user ? (
            <>
              <button className="saved-link" onClick={() => { setShowMine(true); document.getElementById("homes")?.scrollIntoView({ behavior: "smooth" }); }}><Building2 size={16} /> My listings</button>
              <button className="saved-link" onClick={handleSignOut}><LogOut size={16} /> Sign out</button>
            </>
          ) : (
            <button className="saved-link" onClick={() => { setAuthMode("signin"); setAuthError(""); setAuthOpen(true); }}><UserRound size={16} /> Sign in</button>
          )}
          <button className="button button-dark button-small" onClick={requestOwnerListing}><Plus size={16} /> List your property</button>
        </div>
        <button className="mobile-menu" aria-label="Toggle menu" onClick={() => setMobileMenu((value) => !value)}>{mobileMenu ? <X /> : <Menu />}</button>
      </header>

      <main>
        <section className="hero" id="top">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> A simpler way to rent</div>
            <h1>Find your place.<br /><em>Skip the deposit.</em></h1>
            <p className="hero-sub">Rooms, PGs, flats and family homes — discover your next address with <strong>₹0 security deposit</strong>.</p>
            <div className="hero-trust"><span><CheckCircle2 size={16} /> Zero-deposit policy</span><span><ShieldCheck size={16} /> Owner listings</span></div>
          </div>
          <div className="hero-art" aria-label="Illustration of a welcoming home">
            <div className="sun-disc" /><div className="plant plant-left"><span /><i /><b /></div>
            <div className="house-illustration"><div className="roof" /><div className="house-body"><div className="window window-left"><span /><i /></div><div className="door"><span /></div><div className="window window-right"><span /><i /></div></div><div className="steps" /></div>
            <div className="plant plant-right"><span /><i /><b /></div>
            <div className="art-note"><span className="note-icon"><KeyRound size={17} /></span><span><b>Move in lighter</b><small>No security deposit</small></span><CheckCircle2 size={18} className="note-check" /></div>
            <div className="floating-pill"><Sparkles size={15} /> Your next chapter starts here</div>
          </div>
          <div className="hero-bottom">
            <div className="search-panel">
              <div className="search-field location-field"><MapPin size={20} /><div><label htmlFor="location-search">Location</label><input id="location-search" value={queryText} onChange={(event) => { setQueryText(event.target.value); setShowMine(false); }} placeholder="Area, city, PIN or landmark" /></div></div>
              <div className="search-divider" />
              <div className="search-field"><Building2 size={20} /><div><label htmlFor="property-type">Property type</label><select id="property-type" value={type} onChange={(event) => { setType(event.target.value); setShowMine(false); }}>{TYPES.map((item) => <option key={item}>{item}</option>)}</select></div></div>
              <button className="button button-green search-button" onClick={() => document.getElementById("homes")?.scrollIntoView({ behavior: "smooth" })}><Search size={18} /> Search homes</button>
            </div>
          </div>
        </section>

        <section className="benefit-strip" id="how">
          <div><span className="benefit-icon"><CircleDollarSign /></span><span><b>₹0 security deposit</b><small>Every owner agrees to the no-deposit rule</small></span></div>
          <div><span className="benefit-icon"><Building2 /></span><span><b>Every kind of home</b><small>Rooms, PGs, flats & family homes</small></span></div>
          <div><span className="benefit-icon"><BadgeCheck /></span><span><b>Trust comes first</b><small>Owner verification can be added by admins</small></span></div>
        </section>

        <section className="listings-section" id="homes">
          <div className="section-heading">
            <div><div className="eyebrow">{showMine ? "OWNER DASHBOARD" : "YOUR NEXT ADDRESS"}</div><h2>{showMine ? <>Manage your <em>properties.</em></> : <>Homes worth <em>coming home to.</em></>}</h2><p>{showMine ? "Pause, reactivate, mark as rented or remove your listings." : "Live listings from Firebase. Search by location, rent and home type."}</p></div>
            <div className="view-switch">
              <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid view"><LayoutGrid size={17} /></button>
              <button className={view === "map" ? "active" : ""} onClick={() => { setView("map"); }} aria-label="Map view"><MapIcon size={17} /></button>
            </div>
          </div>
          {!showMine && <div className="filter-row">
            <div className="type-chips">{TYPES.map((item) => <button key={item} className={type === item ? "chip active" : "chip"} onClick={() => setType(item)}>{item}</button>)}</div>
            <div className="filter-tools">
              <label className="rent-filter"><SlidersHorizontal size={16} /><span>Up to {money(maxRent)}</span><input type="range" min="5000" max="50000" step="1000" value={maxRent} onChange={(event) => setMaxRent(Number(event.target.value))} aria-label="Maximum monthly rent" /></label>
              <select className="furnishing-select" value={furnishing} onChange={(event) => setFurnishing(event.target.value)} aria-label="Furnishing"><option value="Any">Any furnishing</option><option>Furnished</option><option>Semi-furnished</option><option>Unfurnished</option></select>
              <label className="verified-toggle"><input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} /> Verified</label>
            </div>
          </div>}

          {firebaseError && <div className="firebase-warning"><AlertTriangle size={19} /><div><b>Could not load live listings</b><p>{firebaseError}</p><small>Check that Firestore is created and firestore.rules has been deployed.</small></div></div>}
          {!authReady && <div className="load-state"><Loader2 className="spin" size={22} /> Connecting to RentNear…</div>}
          {loadingListings && authReady && <div className="load-state"><Loader2 className="spin" size={22} /> Loading available homes from Firebase…</div>}

          {view === "map" && !showMine ? (
            <div className="map-placeholder"><div className="map-grid" /><div className="map-message"><span className="map-icon"><MapPin size={24} /></span><h3>Search by locality</h3><p>Live map pins are the next step. Listings, photos and owner details already come from Firebase.</p><button className="button button-dark" onClick={() => setView("grid")}>Back to listings</button></div></div>
          ) : (
            <div className="listing-grid">
              {currentCards.map((listing) => <article className="property-card" key={listing.id}>
                <div className="property-image-wrap">
                  <img src={listing.images?.[0] || ""} alt={listing.title} className="property-image" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
                  <span className="property-type">{listing.type}</span>
                  {!showMine && <button className={saved.includes(listing.id) ? "heart-button saved" : "heart-button"} onClick={() => toggleSaved(listing.id)} aria-label={saved.includes(listing.id) ? "Remove saved home" : "Save home"}><Heart size={18} fill={saved.includes(listing.id) ? "currentColor" : "none"} /></button>}
                  {listing.status === "active" && listing.availableFrom !== "Available soon" && <span className="available-label">Available</span>}
                  {showMine && <span className={`listing-status status-${listing.status}`}>{listing.status || "active"}</span>}
                </div>
                <div className="property-info">
                  <div className="property-topline"><span className="property-config">{listing.config}</span>{listing.verified && <span className="verified-badge"><ShieldCheck size={13} /> Verified</span>}</div>
                  <h3>{listing.title}</h3><p className="property-location"><MapPin size={14} /> {[listing.area, listing.city].filter(Boolean).join(", ")}</p>
                  <div className="property-specs"><span><BedDouble size={15} /> {listing.config}</span><span><Wind size={15} /> {listing.furnishing}</span></div>
                  <div className="property-footer"><div><b>{money(listing.rent)}<small>/mo</small></b><span className="zero-deposit">₹0 security deposit</span></div><button className="card-arrow" onClick={() => setSelectedListing(listing)} aria-label="View property"><Eye size={18} /></button></div>
                  {showMine && <div className="owner-card-actions">
                    {listing.status !== "active" && <button onClick={() => changeStatus(listing, "active")}><PlayCircle size={15} /> Activate</button>}
                    {listing.status === "active" && <button onClick={() => changeStatus(listing, "paused")}><PauseCircle size={15} /> Pause</button>}
                    {listing.status !== "rented" && <button onClick={() => changeStatus(listing, "rented")}><CheckCircle2 size={15} /> Mark rented</button>}
                    <button className="delete-action" onClick={() => removeListing(listing)}><Trash2 size={15} /> Delete</button>
                  </div>}
                </div>
              </article>)}
              {!loadingListings && !firebaseError && currentCards.length === 0 && <div className="empty-state">
                <Building2 size={32} /><h3>{showMine ? "You haven't listed a property yet" : "No homes match your search"}</h3>
                <p>{showMine ? "Add your first room, PG, flat or family home. RentNear never asks for a security-deposit amount." : "Try another locality, increase your budget, or be the first owner to list in this area."}</p>
                {showMine ? <button className="button button-dark" onClick={requestOwnerListing}><Plus size={16} /> List a property</button> : <button className="button button-dark" onClick={() => { setQueryText(""); setType("All homes"); setMaxRent(30000); setFurnishing("Any"); setVerifiedOnly(false); }}>Clear filters</button>}
              </div>}
            </div>
          )}
          <div className="ad-slot"><div className="ad-symbol"><Sparkles size={18} /></div><div><span>ADVERTISEMENT SPACE</span><b>Useful local services, when you need them.</b><small>AdSense integration can be added after the site is live and approved.</small></div><span className="ad-label">AD</span></div>
          {showMine && <button className="button button-outline back-to-search" onClick={() => setShowMine(false)}>← Back to rental search</button>}
        </section>

        <section className="owner-cta">
          <div className="owner-illustration"><div className="owner-window"><span /><i /></div><div className="owner-plant" /></div>
          <div className="owner-copy"><div className="eyebrow">FOR PROPERTY OWNERS</div><h2>Your property deserves<br /><em>the right tenant.</em></h2><p>List your room, PG, flat or family home. Upload real photos and manage availability from your account. Every listing must have ₹0 security deposit.</p><button className="button button-dark" onClick={requestOwnerListing}><Plus size={17} /> List a property for free <ArrowUpRight size={16} /></button></div>
          <div className="owner-perks"><div><CheckCircle2 /> Free listing to start</div><div><CheckCircle2 /> Upload up to 6 photos</div><div><CheckCircle2 /> Manage availability</div><div><CheckCircle2 /> ₹0 deposit policy</div></div>
        </section>
        <section className="safety-section" id="safety"><div className="safety-icon"><ShieldCheck size={27} /></div><div><h2>Rent with clarity. From day one.</h2><p>RentNear's listing form requires owners to accept the ₹0 security-deposit policy. Owner verification is not automatic; only mark properties as verified after a real review.</p></div><a href="#how">Our promise <ArrowUpRight size={16} /></a></section>
      </main>

      <footer className="footer"><a className="brand footer-brand" href="#top"><span className="brand-mark"><Home size={18} /></span><span>rent<span className="brand-accent">near</span><small>Find a home, not a deposit.</small></span></a><span>Made for a simpler rental journey.</span><div><a href="#homes" onClick={() => setShowMine(false)}>Find a home</a><a href="#safety">Safety</a><button onClick={requestOwnerListing}>List property</button></div><small className="footer-note">RentNear · Live Firebase listings · ₹0 security-deposit policy</small></footer>

      {authOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}>
        <section className="owner-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <div className="modal-head"><div><div className="eyebrow">RENTER & OWNER ACCOUNT</div><h2 id="auth-title">{authMode === "signup" ? "Create your account" : "Welcome back"}</h2><p>Sign in to manage listings or create an owner account.</p></div><button className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Close"><X /></button></div>
          <form className="owner-form" onSubmit={handleAuthSubmit}>
            {authMode === "signup" && <label>Full name<input name="name" type="text" autoComplete="name" placeholder="Your name" required /></label>}
            <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
            <label>Password<input name="password" type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength="6" placeholder="At least 6 characters" required /></label>
            {authError && <div className="form-error" role="alert">{authError}</div>}
            <button className="button button-green submit-listing" disabled={authBusy} type="submit">{authBusy ? <Loader2 className="spin" size={17} /> : <UserRound size={17} />}{authBusy ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in"}</button>
          </form>
          <p className="auth-switch">{authMode === "signup" ? "Already registered?" : "New to RentNear?"} <button onClick={() => { setAuthMode(authMode === "signup" ? "signin" : "signup"); setAuthError(""); }}>{authMode === "signup" ? "Sign in" : "Create an account"}</button></p>
          <small className="form-disclaimer">Use email/password authentication. Enable that provider in Firebase Console → Authentication → Sign-in method.</small>
        </section>
      </div>}

      {ownerOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !ownerBusy) setOwnerOpen(false); }}>
        <section className="owner-modal" role="dialog" aria-modal="true" aria-labelledby="owner-title">
          <div className="modal-head"><div><div className="eyebrow">OWNER LISTING</div><h2 id="owner-title">List your property</h2><p>Upload photos and publish a live listing. Security deposit is always ₹0.</p></div><button className="modal-close" onClick={() => !ownerBusy && setOwnerOpen(false)} aria-label="Close"><X /></button></div>
          <form onSubmit={handleCreateListing} className="owner-form">
            <label>Property title<input required maxLength="100" value={ownerForm.title} onChange={(event) => setOwnerForm({ ...ownerForm, title: event.target.value })} placeholder="e.g. Spacious 2 BHK near metro" /></label>
            <div className="form-grid">
              <label>Property type<select value={ownerForm.type} onChange={(event) => setOwnerForm({ ...ownerForm, type: event.target.value, config: event.target.value === "PG" ? "Double sharing" : event.target.value === "Room" ? "Private room" : event.target.value === "Studio" ? "Studio / 1 RK" : "2 BHK" })}>{TYPES.filter((item) => item !== "All homes").map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Configuration<select value={ownerForm.config} onChange={(event) => setOwnerForm({ ...ownerForm, config: event.target.value })}>{PROPERTY_CONFIGS.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <div className="form-grid">
              <label>City<input required maxLength="60" value={ownerForm.city} onChange={(event) => setOwnerForm({ ...ownerForm, city: event.target.value })} placeholder="Hyderabad" /></label>
              <label>Area / locality<input required maxLength="100" value={ownerForm.area} onChange={(event) => setOwnerForm({ ...ownerForm, area: event.target.value })} placeholder="e.g. Kondapur" /></label>
            </div>
            <div className="form-grid">
              <label>PIN code (optional)<input inputMode="numeric" maxLength="10" value={ownerForm.pincode} onChange={(event) => setOwnerForm({ ...ownerForm, pincode: event.target.value })} placeholder="500084" /></label>
              <label>Monthly rent (₹)<input required type="number" min="1" max="10000000" step="1" value={ownerForm.rent} onChange={(event) => setOwnerForm({ ...ownerForm, rent: event.target.value })} /></label>
            </div>
            <label>Address or nearby landmark<input maxLength="180" value={ownerForm.address} onChange={(event) => setOwnerForm({ ...ownerForm, address: event.target.value })} placeholder="Street or nearby landmark (don't share unit details)" /></label>
            <div className="form-grid">
              <label>Furnishing<select value={ownerForm.furnishing} onChange={(event) => setOwnerForm({ ...ownerForm, furnishing: event.target.value })}><option>Furnished</option><option>Semi-furnished</option><option>Unfurnished</option></select></label>
              <label>Available from<input type="date" value={ownerForm.availableFrom} onChange={(event) => setOwnerForm({ ...ownerForm, availableFrom: event.target.value })} /></label>
            </div>
            <label>Owner / contact name<input required maxLength="80" value={ownerForm.ownerName} onChange={(event) => setOwnerForm({ ...ownerForm, ownerName: event.target.value })} placeholder={user?.displayName || "Your name"} /></label>
            <label>Contact phone number<input required type="tel" inputMode="tel" pattern="[0-9+() -]{8,18}" maxLength="18" value={ownerForm.ownerPhone} onChange={(event) => setOwnerForm({ ...ownerForm, ownerPhone: event.target.value })} placeholder="Number renters can call" /></label>
            <label>Furnishing, amenities, rules and nearby transport<textarea rows="3" maxLength="1200" value={ownerForm.description} onChange={(event) => setOwnerForm({ ...ownerForm, description: event.target.value })} placeholder="Describe the property accurately…" /></label>
            <label>Amenities (comma separated)<input maxLength="250" value={ownerForm.amenities} onChange={(event) => setOwnerForm({ ...ownerForm, amenities: event.target.value })} placeholder="Parking, balcony, lift, Wi-Fi" /></label>
            <label className="photo-input"><span><ImagePlus size={18} /> Property photos (1–{MAX_PHOTOS}, up to 5 MB each)</span><input type="file" accept="image/*" multiple required onChange={(event) => setPhotos(Array.from(event.target.files || []).slice(0, MAX_PHOTOS))} /><small>{photos.length ? photos.map((photo) => photo.name).join(", ") : "Choose bedroom, living room, kitchen, exterior and amenity photos."}</small></label>
            {photos.length > MAX_PHOTOS && <div className="form-error">You can add up to {MAX_PHOTOS} photos.</div>}
            <div className="zero-policy"><ShieldCheck size={20} /><span><b>₹0 security deposit is mandatory</b><small>There is deliberately no deposit amount field. By publishing, you agree not to request a security deposit. Any other mandatory charges must be disclosed separately.</small></span></div>
            <label className="check-row"><input type="checkbox" checked={ownerForm.acceptsZeroDeposit} onChange={(event) => setOwnerForm({ ...ownerForm, acceptsZeroDeposit: event.target.checked })} /> I agree to the zero-security-deposit policy.</label>
            <label className="check-row"><input type="checkbox" checked={ownerForm.publishesPhone} onChange={(event) => setOwnerForm({ ...ownerForm, publishesPhone: event.target.checked })} /> I consent to showing this contact number to all visitors.</label>
            {ownerError && <div className="form-error" role="alert">{ownerError}</div>}
            <button className="button button-green submit-listing" disabled={ownerBusy || !authReady || !user} type="submit">{ownerBusy ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}{ownerBusy ? "Uploading photos and publishing…" : "Publish property"}</button>
            <small className="form-disclaimer">Your listing and images will be public. Only submit properties you are authorised to advertise. Do not include sensitive identity documents or exact private access details.</small>
          </form>
        </section>
      </div>}

      {selectedListing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedListing(null); }}>
        <section className="owner-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
          <div className="modal-head"><div><div className="eyebrow">PROPERTY DETAILS</div><h2 id="detail-title">{selectedListing.title}</h2><p><MapPin size={13} className="inline-icon" /> {[selectedListing.area, selectedListing.city, selectedListing.pincode].filter(Boolean).join(", ")}</p></div><button className="modal-close" onClick={() => setSelectedListing(null)} aria-label="Close"><X /></button></div>
          <div className="detail-photos">{(selectedListing.images || []).map((url, index) => <img key={url} src={url} alt={`Property photo ${index + 1}`} />)}</div>
          <div className="detail-pricing"><div><b>{money(selectedListing.rent)} / month</b><span>₹0 security deposit</span></div><span className="property-config">{selectedListing.config}</span></div>
          <p className="detail-location">{[selectedListing.address, selectedListing.area, selectedListing.city, selectedListing.pincode].filter(Boolean).join(", ")}</p>
          <p className="detail-description">{selectedListing.description || "The owner has not added a description yet."}</p>
          {!!selectedListing.amenities?.length && <div className="detail-amenities">{selectedListing.amenities.map((item) => <span key={item}>{item}</span>)}</div>}
          <div className="owner-contact"><div><b>{selectedListing.ownerName || "Property owner"}</b><small>Listing contact</small></div><a className="button button-green" href={`tel:${String(selectedListing.ownerPhone || "").replace(/[^0-9+]/g, "")}`}><Phone size={16} /> Call owner</a></div>
          <small className="form-disclaimer">RentNear does not collect rent or deposits. Verify the property and terms before making any payment. Contact details are published with the owner's consent.</small>
        </section>
      </div>}

      {notice && <div className="toast"><CheckCircle2 size={18} /> {notice}</div>}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
