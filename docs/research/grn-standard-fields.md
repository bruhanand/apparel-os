# Standard GRN fields in common practice

Research date: 20 October 2026  
Status: Reference for the stage 2 goods-in design (the product owner asked for a GRN "using industry standards"); no product decisions approved. In Apparel OS the GRN records counted quantities only, never values (stage 2 grill round 1).

Tags: [NU] near-universal, [CO] common but optional, [IN] India-specific, [RARE] seen in few sources. S-numbers are sources, listed at the end.
## 1. Header fields
- GRN / receipt number, system-numbered [NU] (S3 Purchase Receive#, S5 Receipt Number, S7 product receipt id, S4 voucher number).
- Receipt date and posting date [NU] (S1 Document Date + Posting Date; S3 Receive Date; S5 Receipt Date; S12/S13 GS1 date qualifiers 137 and 50).
- Receiving site / warehouse / location [NU] (S5 ship-to organisation; S3 location and branch; S1 plant and storage location at item level).
- Supplier [NU]. Purchase order or booking reference [NU when PO-based; absent on blind receipts] (S1, S3, S4 Order Number, S5, S13 order ref, S9 source document).
- Supplier delivery document (delivery note, packing slip or challan number) [NU in formal ERPs]: S1 "Delivery Note" (MKPF XBLNR/LFSNR), S5 Packing Slip, S7 product receipt id "typically the supplier's packing slip" (required for accounting), S8 Vendor Shipment No., S13 despatch advice ref. Odoo and Zoho do not require it (Zoho has a free reference_number, S3).
- Supplier invoice number and date [CO on the receipt]. Tally keeps it on the purchase voucher (S4); SAP guides put it in header text (S2); Oracle only on an ASBN (S5). Invoices often arrive later and are matched by three-way match. In India the invoice or challan travels with the goods (S14, S15) and e-way bill Part A quotes its number and date (S16), so Indian formats commonly capture it.
- Bill of lading / lorry receipt (LR) / waybill number [CO]: SAP Bill of Lading = LR or docket number for domestic vendors (S1, MKPF FRBNR); Oracle Bill of Lading and Waybill/Airbill (S5); Tally "receipt doc no., bill of lading, destination" (S4). A transport-document date appears only in e-way bill Part B for rail, air, ship (S16, S17).
- Transporter / freight carrier [CO] (S5 Freight Carrier; S3 carrier and tracking number; S6 carrier code). [IN] Transporter ID is an e-way bill field (S16, S17).
- Vehicle number [CO, IN]: not a field on the SAP, Oracle, Zoho or Tally receipts read; it is e-way bill Part B (S16, S17) and appears in Indian store formats, mainly bulk goods (S18).
- E-way bill number [IN, RARE]: found on no ERP receipt document read; one vendor template only suggests adding "an e-way bill reference field" (S19). Rule 138 needs an e-way bill above Rs 50,000 consignment value (S16, S17).
- Number of packages / cartons / containers [CO] (S5 Number of Containers; S6 Cont Qty; S13 NumberOfPackages; S19 package count).
- Seal condition [RARE]: no ERP receipt document read has a seal field. Seal integrity appears only in warehouse receiving checklists (S20); treat it as a checklist item.
- Packing condition and header remarks [NU as free text] (S1 Header Text; S5 Comments; S3 Notes; S9 Notes).
- Received by [NU, normally the signed-in user] (S5 Received By; S1 goods recipient at item level). Checked by / second signature [CO]: S19 "authorizer, a second person"; S18 storekeeper plus QC.
- Expected / shipped date and ASN or shipment number [CO] (S5, S13). Attachments or photos [CO] (S3 documents; S6 vendor non-conformance with pictures).
## 2. Line fields
- Item / SKU code and description [NU]. Colour and size: no source lists them as separate GRN fields; they are attributes of the variant SKU, so a line is one SKU (S21, low trust).
- Unit of measure [NU] (S1 Unit of Entry; S3 unit; S5 UOM; S13 UnitOfMeasure). Ordered quantity [NU, shown from the PO] (S13 QTY 21 / QuantityOrder).
- Delivered / challan / invoiced quantity [CO]: S1 "Qty in Delivery Note"; S13 QuantityDelivery; S12 QTY 46 delivered.
- Received quantity [NU] (S1; S3 quantity; S10 quantity_received; S11 ReceivedQuantity; S13 QTY 194 "received and accepted").
- Accepted [CO] (S11 AcceptedQuantity; S1 stock type unrestricted / quality inspection / blocked). Damaged [CO] (S10 quantity_damaged, held as waste stock; S11 DamagedQuantity).
- Short and excess [CO, usually computed as received minus delivered or ordered]: S11 ShortageQuantity, ExcessQuantity; S12/S13 quantity variance plus reason code; S7 under- and over-delivery edited on the line; S8 over-receipt quantity within tolerance.
- Rejected [CO]: rarely its own field. GS1 reports a delivered-but-refused line with accepted quantity zero and a reason (S12); SAP uses blocked stock plus reason for movement (S1, S2).
- Reason code / line remark [CO] (S2 reason for movement, item text; S5 Reason, Comments; S13 QuantityVarianceReason). Storage location or bin [CO] (S1, S5 subinventory, S3 storages). Batch / lot / serial [CO, only when tracked] (S1, S3, S5).
- Delivery-completed flag to close a short PO line [CO] (S1 Del. Completed Ind.); Odoo's equivalent is the backorder choice (S9).
## 3. Footer / sign-off
- Receiver name or signature and date-time [NU] (S18, S19, S22). Checker / authoriser second signature [CO] (S19). Overall condition and discrepancy notes [NU as text] (S22). Receipt status (in transit, received, inspected) [CO] (S3, S11).
## 4. Money-bearing fields (flag: outside our counted-quantity-only GRN)
- Rate, amount, line total: S3 line rate and item_total; S4 Tally receipt note rate and amount (auto-filled from the order); S13 GS1 net unit price (PRI), total net line value (MOA), VAT rate, all optional; S19 unit price and line value.
- Tax and charges: GS1 VAT rate (S13); Oracle ASBN TaxAmount, FreightAmount, TotalInvoiceAmount, InvoiceNumber, InvoiceDate, PaymentTerms, CurrencyCode (S5 vendor mirror); Zoho currency and inclusive-tax flag (S3).
- SAP derives value at posting (MSEG DMBTR amount, BNBTR delivery costs, VKWRT sales value; MKPF FRATH unplanned delivery costs) from PO price, not keyed by the receiver (S2). Dynamics and Business Central also value the receipt from the PO (S7, S8).
- Statutory money sits on the supplier's documents, not on the receipt: invoice total, taxable value, tax rate and amount (Rule 46, S14); challan taxable value and tax when for supply (Rule 55, S15); e-way bill value (S16). HSN is classification, not money.
- Quantity-only receipts are normal: Odoo's receipt header has no price field (S9), Square's goods receipt is quantities only (S10), Salesforce GRN item fields are quantities (S11), GS1 RECADV price segments are optional (S12, S13).
## 5. Sources (secondary = page not opened directly, or vendor/community mirror)
- S1 https://www.docsie.io/tutorials/sap/post-a-goods-receipt-migo/ : MIGO walkthrough, header and item fields (guide, medium trust).
- S2 https://leanx.eu/sap/table/mkpf/ , https://leanx.eu/sap/table/mseg/ : SAP material document field lists (mirror); header-text invoice tip from https://purchasing.uky.edu/sites/default/files/2026-07/a05-qrc-s4-migo-goods-receipt.docx (university card, search summary).
- S3 https://www.zoho.com/inventory/api/v1/purchasereceives/ and https://www.zoho.com/ke/inventory/help/purchase-orders/purchase-receive.html : Zoho Inventory purchase receive (official).
- S4 https://help.tallysolutions.com/docs/te9rel52/Voucher_Entry/Inventory_Vouchers/Receipt_Note_Voucher_GRN.htm , https://help.tallysolutions.com/tally-prime/purchase-process/purchase-goods-and-services-tally/ : Tally receipt note and purchase voucher (official; field lists incomplete).
- S5 https://docs.oracle.com/cd/A60725_05/html/comnls/us/po/rcts06.htm (official, legacy receipt header); https://cdn.cdata.com/help/KSM/tableau/pg_InventoryManagementtable-receivingreceiptrequests.htm (CData mirror of Oracle Fusion receipt requests).
- S6 https://docs.oracle.com/cd/E12456_01/rwms/pdf/141/html/ug/receiving.htm : Oracle Retail warehouse receiving, ASN header, trouble codes (official).
- S7 https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/product-receipt-against-purchase-orders : Dynamics 365 product receipt and packing slip identifier (official).
- S8 https://learn.microsoft.com/en-us/training/modules/receive-invoice-dynamics-d365-business-central/1-receive-items : Business Central receipt, Vendor Shipment No. (official).
- S9 https://raw.githubusercontent.com/odoo/odoo/17.0/addons/stock/models/stock_picking.py ; https://www.odoo.com/documentation/13.0/applications/inventory_and_mrp/purchase/purchases/rfq/reception.html : Odoo receipt fields (source) and backorder (official).
- S10 https://developer.squareup.com/reference/square/objects/TransferOrderGoodsReceiptLineItem : Square retail goods receipt line (official).
- S11 https://developer.salesforce.com/docs/atlas.en-us.mfg_api_devguide.meta/mfg_api_devguide/sforce_api_objects_goodsreceivednoteitem.htm : GRN item quantities (403 on fetch; search summary, secondary).
- S12 https://www.gs1.org/sites/default/files/docs/eancom/s3/recadv.pdf ; https://gs1.org/sites/gs1/files/docs/eancom/ean02s4/part2/recadv/examples.htm : GS1 EANCOM receiving advice (not opened; search summary, secondary).
- S13 https://docs.ediconnect.ro/en/ediconnect/messages/recadv.html ; https://www.edifactory.de/edifact/directory/D01B/message/RECADV : RECADV D.01B fields and structure (third-party, read in full).
- S14 https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/rules/cgst_rules/active/chapter6/rule46_v1.00.html : CGST Rule 46 (official; certificate error, read via https://gstzen.in/a/tax-invoice-cgst-rule-46.html search summary).
- S15 https://gstzen.in/a/transportation-of-goods-without-issue-of-invoice-cgst-rule-55.html : Rule 55 delivery challan particulars (secondary reproduction).
- S16 https://gstzen.in/a/rule-138-central-goods-and-services-tax-rules-2017-cgst-rule-138-replaced-as-per-central-tax-notification-122018.html ; https://www.gstcouncil.gov.in/sites/default/files/2024-02/electronic-way-bill-050819.pdf : Rule 138 (superseded text) and GST Council e-way bill note (PDF unreadable here; Part A/B via search summary).
- S17 https://busy.in/gst/how-to-generate-e-way-bills-through-the-e-way-bill-portal.md ; https://gstzen.in/a/what-is-e-way-bill.html : e-way bill portal fields, Part A and B (software vendors, secondary).
- S18 https://infralens.in/formats/stores/grn-goods-received-note : Indian stores GRN format, vehicle number, challan, storekeeper and QC (search summary, secondary).
- S19 https://enerpize.com/templates/goods-received-note : vendor GRN template; suggests e-way bill reference for India (vendor page).
- S20 https://racklify.com/encyclopedia/inbound-quality-inspection-checklist-for-warehouse-receiving/ ; https://goaudits.com/checklist/warehouse-receiving-checklist-template/921/40 : seal and carton checks in checklists (templates, low trust).
- S21 https://www.supplychainconnect.com/supply-chain-technology/article/55402799/overcoming-sku-proliferation-and-matrix-complexity-in-modern-apparel-supply-chains : style-colour-size is its own SKU (trade article, low trust). S22 https://invoicedataextraction.com/blog/what-is-a-goods-received-note ; https://themunim.com/goods-received-note/ : generic GRN field lists (vendor blogs, low trust).
Gaps: no official source found with e-way bill, vehicle or LR date on an ERP receipt; SAP Help portal and Odoo field docs did not load.
