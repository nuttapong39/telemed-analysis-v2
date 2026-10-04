# Identify telemedicine services by the TELMED standard code, not local icodes

The dashboard used to filter three hard-coded local icodes (B2B, B2C, Telehealth), so it only worked at the hospital that defined them. It now selects every non-drug item whose NHSO ADP code is `TELMED` with ADP type 3, and treats each matching local icode as one service, named by the hospital. We gave up the fixed B2B/B2C/Telehealth split, which no standard expresses, in exchange for an add-on that works at any HOSxP site.

Visits are counted by distinct VN, falling back to HN + visit date when a charge line carries no VN, and `ovst` is left-joined. On the HOSxP Marketplace test database a VN-only count reported zero visits while the same rows showed items and amounts, which points to charge lines without a VN; that was the main reason the add-on was rejected on 2026-10-03. An inner join on `ovst` would have dropped those lines entirely.
